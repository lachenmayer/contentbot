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

module.exports = async function Contentbot(options = {}) {
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
  if (options.path != null) {
    schemaSource = await fs.readFile(options.schemaPath, { encoding: 'utf8' })
  }

  const schema = buildSchema(schemaSource)
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

    const pageFields = mapValues(type._fields, field => ({
      type: field.type,
      description: field.description,
    }))

    const pageType = new GraphQLObjectType({
      name,
      interfaces: () => [Page],
      fields: () => ({ ...genericPageFields, ...pageFields }),
    })
    pageTypes[name] = pageType

    const inputType = new GraphQLInputObjectType({
      name: name + 'Input',
      fields: () => ({ ...genericPageFields, ...pageFields }),
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
        return content
      },
    }
  }

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
