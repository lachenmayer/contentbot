const test = require('ava')
const fs = require('fs')
const { graphql, GraphQLSchema, printSchema } = require('graphql')
const tempy = require('tempy')

const Contentbot = require('.')

const schema = fs.readFileSync('mock/site.graphql', 'utf8')

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
          __typename
          url
        }
      }
    `
  )
  t.falsy(response.errors)
  t.deepEqual(response.data.pages, [
    { __typename: 'About', url: '/about' },
    { __typename: 'GenericPage', url: '/' }, // because Home is not defined in schema.
  ])
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

test('writeFilm writes a film page', async t => {
  const contentPath = tempy.directory()
  console.log(contentPath)
  const c = await Contentbot({ schema, contentPath })
  const mutation = await graphql(
    c,
    `
      mutation {
        writeFilm(
          content: {
            url: "/films/national-youth-orchestra"
            title: "National Youth Orchestra"
            role: "DoP"
            youtubeUrl: "test"
          }
        ) {
          url
          title
          role
          pitch
          description
          youtubeUrl
        }
      }
    `
  )
  t.falsy(mutation.errors)
  t.deepEqual(mutation.data.writeFilm, {
    url: '/films/national-youth-orchestra',
    title: 'National Youth Orchestra',
    role: 'DoP',
    pitch: null,
    description: null,
    youtubeUrl: 'test',
  })
  const query = await graphql(
    c,
    `
      query {
        page(url: "/films/national-youth-orchestra") {
          url
          title
          ... on Film {
            role
            pitch
            description
            youtubeUrl
          }
        }
      }
    `
  )
  t.falsy(query.errors)
  t.deepEqual(query.data.page, {
    url: '/films/national-youth-orchestra',
    title: 'National Youth Orchestra',
    role: 'DoP',
    pitch: null,
    description: null,
    youtubeUrl: 'test',
  })
})

test('fields resolves with all fields', async t => {
  const c = await Contentbot({ schema, contentPath: 'mock/content' })
  const query = await graphql(
    c,
    `
      query {
        fields(type: "Film") {
          name
          type
          description
        }
      }
    `
  )
  t.falsy(query.errors)
  t.deepEqual(query.data.fields, [
    { name: 'role', type: 'text', description: null },
    {
      name: 'pitch',
      type: 'long-text',
      description: 'Short pitch (< 200 characters)',
    },
    {
      name: 'description',
      type: 'long-text',
      description: 'Long description',
    },
    { name: 'youtubeUrl', type: 'url', description: 'YouTube URL' },
  ])
})
