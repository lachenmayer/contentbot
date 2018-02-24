const test = require('ava')
const { graphql, GraphQLSchema, printSchema } = require('graphql')

const Contentbot = require('.')

const schema = `
type About {
  bio: String
}

type Film {
  role: String
  pitch: String
  description: String
  youtubeUrl: String
}
`

test('constructor generates a GraphQL schema', async t => {
  const c = await Contentbot({ schema, contentPath: 'mock/content' })
  t.true(c instanceof GraphQLSchema)
})

test('constructor generates a GraphQL schema with all required fields', async t => {
  const c = await Contentbot({ schema, contentPath: 'mock/content' })
  t.snapshot(printSchema(c))
})

test('pages field resolves with all pages', async t => {
  const c = await Contentbot({ schema, contentPath: 'mock/content' })
  const response = await graphql(
    c,
    `
      query {
        pages {
          url
        }
      }
    `
  )
  t.falsy(response.errors)
  t.deepEqual(response.data.pages, [{ url: '/about' }, { url: '/' }])
})

test('allAbouts resolves with all About pages', async t => {
  const c = await Contentbot({ schema, contentPath: 'mock/content' })
  const response = await graphql(
    c,
    `
      query {
        allAbouts {
          url
          title
          bio
        }
      }
    `
  )
  t.falsy(response.errors)
  t.deepEqual(response.data.allAbouts, [
    {
      url: '/about',
      title: 'About me',
      bio: 'This is just a test. Repeat, **this is just a test**.',
    },
  ])
})
