const assert = require('assert')
const {
  GraphQLInputObjectType,
  GraphQLInterfaceType,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLString,
  GraphQLSchema,
  buildSchema,
} = require('graphql')
const hypha = require('hypha')
const mapValues = require('lodash.mapvalues')
const mkdirp = require('mkdirp')
const path = require('path')
const pify = require('pify')
const smarkt = require('smarkt')

async function Contentbot(options = {}) {
  assert(typeof options === 'object', 'options need to be an object')

  assert(
    (typeof options.schemaPath === 'string' && options.schema == null) ||
      (typeof options.schema === 'string' && options.schemaPath == null),
    'only one of schema or schemaPath can be defined at once'
  )

  assert(typeof options.contentPath === 'string', 'content path is required')

  const _fs = isFs(options.fs) ? options.fs : require('fs')
  const fs = pify(_fs)
  const mkdir = pify((dir, cb) => mkdirp(dir, { fs: _fs }, cb))

  //
  // Content
  //

  const contentRoot = options.contentPath

  async function readSite() {
    return await hypha.readSite(contentRoot, {
      fs,
      parent: contentRoot,
    })
  }

  let site = await readSite()

  //
  // Generic types
  //

  const genericPageFields = {
    url: { type: new GraphQLNonNull(GraphQLString) },
    title: { type: GraphQLString },
  }

  const Page = new GraphQLInterfaceType({
    name: 'Page',
    fields: () => genericPageFields,
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
    fields: () => genericPageFields,
  })

  //
  // User-defined schema
  //

  let schemaSource = options.schema
  if (options.schemaPath != null) {
    schemaSource = await fs.readFile(options.schemaPath, { encoding: 'utf8' })
  }

  const directiveDefinitions = [
    'directive @field(type: String) on FIELD_DEFINITION',
  ]

  const directiveSource = directiveDefinitions.join('\n') + '\n'

  const schema = buildSchema(directiveSource + schemaSource)
  const typeMap = schema.getTypeMap()

  let pageTypes = {}
  let pageQueryFields = {}
  let pageMutationFields = {}

  for (let [name, type] of Object.entries(typeMap)) {
    if (
      name.startsWith('__') ||
      ['String', 'Boolean', 'Int', 'Float', 'ID'].includes(name)
    ) {
      // built-in types - we will be regenerating those in our own GraphQL schema.
      continue
    }

    const pageFields = mapValues(type.getFields(), (field, name) => ({
      type: field.type,
      description: field.description,
      resolve(page) {
        // FIXME smarkt lowercases the keys for some reason.
        // This is a bug in my opinion, we should be able to remove this resolver.
        return page[name.toLowerCase()]
      },
    }))

    const pageType = new GraphQLObjectType({
      name,
      interfaces: () => [Page],
      fields: () => ({ ...genericPageFields, ...pageFields }),
    })
    pageTypes[name] = pageType

    // We need to remove the resolve function from the page fields to use them in an input type.
    // We should be able to remove this if we can delete the custom resolver (see FIXME)
    const pageInputFields = mapValues(pageFields, ({ type, description }) => ({
      type,
      description,
    }))
    const inputType = new GraphQLInputObjectType({
      name: name + 'Input',
      fields: () => ({ ...genericPageFields, ...pageInputFields }),
    })

    pageQueryFields[`all${name}s`] = {
      type: new GraphQLList(pageType),
      resolve() {
        return Object.values(site).filter(page => page.type === name)
      },
    }

    pageMutationFields[`write${name}`] = {
      type: pageType,
      args: {
        content: { type: inputType },
      },
      async resolve(_, { content }) {
        const url = path.normalize(content.url) // no /../../../ hax
        const pageContent = {
          type: name,
          ...content,
        }
        delete pageContent.url
        const pageDir = path.join(contentRoot, url)
        await mkdir(pageDir)
        const pageFile = path.join(pageDir, 'index.txt')
        await fs.writeFile(pageFile, smarkt.stringify(pageContent), {
          encoding: 'utf8',
        })
        site = await readSite()
        return site[url]
      },
    }
  }

  const Field = new GraphQLObjectType({
    name: 'Field',
    fields: () => ({
      name: { type: new GraphQLNonNull(GraphQLString) },
      type: { type: GraphQLString },
      description: { type: GraphQLString },
    }),
  })

  //
  // Generated schema
  //

  return new GraphQLSchema({
    query: new GraphQLObjectType({
      name: 'Query',
      fields: () => ({
        _ignore: {
          type: GenericPage,
          description:
            'This field does not do anything. It is required because there is currently no other way to add a type to the schema.',
        },
        fields: {
          type: new GraphQLList(Field),
          args: { type: { type: new GraphQLNonNull(GraphQLString) } },
          resolve(_, { type }) {
            const pageType = typeMap[type]
            const fields = pageType.getFields()
            let result = []
            for (let [name, field] of Object.entries(fields)) {
              const description = field.description
              const fieldDirective = getDirective(field, 'field')
              const type =
                fieldDirective != null
                  ? fieldDirective.arguments.type
                  : defaultFieldType(field)
              result.push({ name, type, description })
            }
            return result
          },
        },
        page: {
          type: Page,
          args: { url: { type: new GraphQLNonNull(GraphQLString) } },
          resolve(_, { url }) {
            return site[url]
          },
        },
        pages: {
          type: new GraphQLList(Page),
          resolve() {
            return Object.values(site)
          },
        },
        ...pageQueryFields,
      }),
    }),
    mutation: new GraphQLObjectType({
      name: 'Mutation',
      fields: () => pageMutationFields,
    }),
  })
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

function getDirective(field, name) {
  const directive = field.astNode.directives.find(
    directive => directive.name.value === name
  )
  if (directive == null) {
    return null
  }
  const args = {}
  for (let argument of directive.arguments) {
    args[argument.name.value] =
      argument.value != null ? argument.value.value : null
  }
  return {
    name,
    arguments: args,
  }
}

function defaultFieldType(field) {
  switch (field.type.name) {
    case 'String':
      return 'text'
    default:
      console.error('unhandled field type', field.type, '- defaulting to text')
      return 'text'
  }
}

module.exports = Contentbot
