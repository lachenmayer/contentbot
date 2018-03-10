const assert = require('assert')
const {
  GraphQLInputObjectType,
  GraphQLInt,
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
const move = require('move-concurrently')
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

  const contentPath = options.contentPath

  async function readSite() {
    return await hypha.readSite(contentPath, {
      fs,
      parent: contentPath,
    })
  }

  let site = await readSite()

  //
  // Generic types
  //

  const genericPageFields = {
    url: { type: new GraphQLNonNull(GraphQLString) },
    title: { type: GraphQLString },
    order: {
      type: GraphQLInt,
      description:
        'Specifies the sort order of the page. Pages are sorted in ascending order.',
    },
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

    const pageFields = mapValues(type.getFields(), field => ({
      type: field.type,
      description: field.description,
    }))

    const fields = () => Object.assign({}, genericPageFields, pageFields)

    const pageType = new GraphQLObjectType({
      name,
      interfaces: () => [Page],
      fields,
    })
    pageTypes[name] = pageType

    const inputType = new GraphQLInputObjectType({
      name: name + 'Input',
      fields,
    })

    pageQueryFields[`all${name}s`] = {
      type: new GraphQLList(pageType),
      resolve() {
        const pages = Object.values(site).filter(page => page.type === name)
        pages.sort((a, b) => {
          if (a.order == null && b.order == null) return 0
          if (a.order == null) return 1
          if (b.order == null) return -1
          return a.order - b.order
        })
        return pages
      },
    }

    pageMutationFields[`write${name}`] = {
      type: pageType,
      args: {
        content: { type: inputType },
      },
      async resolve(_, { content }) {
        const pageContent = Object.assign({}, { type: name }, content)
        delete pageContent.url
        const pageDir = urlToPath(contentPath, content.url)
        await mkdir(pageDir)
        const pageFile = path.join(pageDir, 'index.txt')
        await fs.writeFile(pageFile, smarkt.stringify(pageContent), {
          encoding: 'utf8',
        })
        site = await readSite()
        return site[content.url]
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
      fields: () =>
        Object.assign({}, pageQueryFields, {
          fields: {
            type: new GraphQLList(Field),
            args: { type: { type: new GraphQLNonNull(GraphQLString) } },
            resolve(_, { type }) {
              const pageType = typeMap[type]
              const fields = pageType.getFields()
              let result = []
              // TODO find a way to dynamically get these rather than manually adding them.
              result.push({ name: 'url', type: 'url', description: 'Link' })
              result.push({
                name: 'title',
                type: 'text',
                description: 'Title',
              })
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

          _ignore: {
            type: GenericPage,
            description:
              'This field does not do anything. It is required because there is currently no other way to add a type to the schema.',
          },
        }),
    }),
    mutation: new GraphQLObjectType({
      name: 'Mutation',
      fields: () =>
        Object.assign({}, pageMutationFields, {
          rename: {
            type: Page,
            args: {
              from: { type: new GraphQLNonNull(GraphQLString) },
              to: { type: new GraphQLNonNull(GraphQLString) },
            },
            async resolve(_, args) {
              const from = urlToPath(contentPath, args.from)
              const to = urlToPath(contentPath, args.to)
              await mkdir(to)
              await move(from, to, { fs })
              // If the moved path was nested, we have to delete the leftover
              // path segments if they are empty, otherwise we get spurious pages.
              const relativeFrom = from.replace(contentPath, '')
              let directories = relativeFrom
                .split(path.sep)
                .filter(s => s !== '')
              while (directories.length > 1) {
                directories = directories.slice(0, directories.length - 1)
                const toDelete = path.join(contentPath, ...directories)
                const files = await fs.readdir(toDelete)
                const isEmpty = files.length === 0
                if (isEmpty) {
                  await fs.rmdir(toDelete)
                }
              }
              site = await readSite()
              return site[args.to]
            },
          },
        }),
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
  const ast = field.astNode
  if (ast == null) {
    return null
  }
  const directive = ast.directives.find(
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

// Ensures that hax0rs can't write to random parts of the fs by removing /../../../
function urlToPath(contentPath, url) {
  const relativeUrl = path.normalize(url)
  return path.join(contentPath, relativeUrl)
}

module.exports = Contentbot
