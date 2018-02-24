const assert = require('assert')
const {
  GraphQLInterfaceType,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLString,
  GraphQLSchema,
  buildSchema,
  printSchema,
} = require('graphql')
const hypha = require('hypha')
const mapValues = require('lodash.mapvalues')
const pify = require('pify')

module.exports = async function Contentbot(options = {}) {
  assert(typeof options === 'object', 'options need to be an object')

  assert(
    (typeof options.schemaPath === 'string' && options.schema == null) ||
      (typeof options.schema === 'string' && options.schemaPath == null),
    'only one of schema or schemaPath can be defined at once'
  )

  assert(typeof options.contentPath === 'string', 'content path is required')

  const fs = isFs(options.fs) ? options.fs : require('fs')

  let schemaSource = options.schema
  if (options.path != null) {
    const readFile = pify(fs.readFile)
    schemaSource = await readFile(options.schemaPath, { encoding: 'utf8' })
  }

  const schema = buildSchema(schemaSource)
  const typeMap = schema.getTypeMap()

  let pageTypes = {}
  let pageQueryFields = {}

  const requiredPageFields = {
    url: { type: new GraphQLNonNull(GraphQLString) },
    title: { type: new GraphQLNonNull(GraphQLString) },
  }

  const Page = new GraphQLInterfaceType({
    name: 'Page',
    fields: () => requiredPageFields,
    resolveType(page) {
      if (page.type == null) {
        return GenericPage
      }
      const type = pageTypes[page.type]
      if (type == null) {
        console.warn(
          `Page type "${
            page.type
          }" does not exist. Falling back to a generic page.`
        )
        return GenericPage
      }
      return type
    },
  })

  const GenericPage = new GraphQLObjectType({
    name: 'GenericPage',
    interfaces: () => [Page],
    fields: () => requiredPageFields,
  })

  for (let [name, type] of Object.entries(typeMap)) {
    if (
      name.startsWith('__') ||
      ['String', 'Boolean', 'Int', 'Float', 'ID'].includes(name)
    ) {
      // built-in types - we will be regenerating those in our own GraphQL schema.
      continue
    }

    const pageFields = mapValues(type._fields, field => ({
      type: field.type,
      description: field.description,
    }))

    const pageType = new GraphQLObjectType({
      name,
      interfaces: () => [Page],
      fields: () => ({ ...requiredPageFields, ...pageFields }),
    })

    pageTypes[name] = pageType

    pageQueryFields[`all${name}s`] = {
      type: new GraphQLList(pageType),
      resolve() {
        return Object.values(content).filter(page => page.type === name)
      },
    }
  }

  const content = await hypha.readSite(options.contentPath, {
    fs,
    parent: options.contentPath,
  })

  const generatedSchema = new GraphQLSchema({
    query: new GraphQLObjectType({
      name: 'Query',
      fields: () => ({
        _ignore: {
          type: GenericPage,
          description:
            'This field does not do anything. It is required because there is currently no other way to add a type to the schema.',
        },
        pages: {
          type: new GraphQLList(GenericPage),
          resolve() {
            return Object.values(content)
          },
        },
        ...pageQueryFields,
      }),
    }),
  })

  return generatedSchema
}

function isFs(fs) {
  return (
    typeof fs === 'object' &&
    typeof fs.mkdir === 'function' &&
    typeof fs.readdir === 'function' &&
    typeof fs.writeFile === 'function' &&
    typeof fs.readFile === 'function'
  )
}
