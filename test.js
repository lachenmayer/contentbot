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
  t.snapshot(response.data.pages)
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
            pitch: null
            description: null
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
    pitch: '',
    description: '',
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
    pitch: '',
    description: '',
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
    { name: 'url', type: 'url', description: 'Link' },
    { name: 'title', type: 'text', description: 'Title' },
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

test('pages are sorted by order - last if unspecified', async t => {
  const c = await Contentbot({ schema, contentPath: 'mock/content' })
  const query = await graphql(
    c,
    `
      query {
        allFilms {
          title
        }
      }
    `
  )
  t.falsy(query.errors)
  t.deepEqual(query.data.allFilms, [
    { title: 'One' },
    { title: 'Two' },
    { title: 'Three' },
    { title: 'Four' },
  ])
})

test('rename page - happy case', async t => {
  const contentPath = tempy.directory()
  console.log(contentPath)
  const c = await Contentbot({ schema, contentPath })
  const setup = await graphql(
    c,
    `
      mutation {
        writeFilm(
          content: {
            url: "/national-youth-orchestra"
            title: "National Youth Orchestra"
          }
        ) {
          url
          title
        }
      }
    `
  )
  t.falsy(setup.errors)
  const mutation = await graphql(
    c,
    `
      mutation {
        rename(from: "/national-youth-orchestra", to: "/some weird url") {
          url
          title
        }
      }
    `
  )
  t.falsy(mutation.errors)
  t.deepEqual(mutation.data.rename, {
    url: '/some weird url',
    title: 'National Youth Orchestra',
  })
  // Check that no other random pages have appeared
  const query = await graphql(
    c,
    `
      query {
        pages {
          url
          title
        }
      }
    `
  )
  t.falsy(query.errors)
  t.deepEqual(query.data, {
    pages: [
      { url: '/', title: null },
      { url: '/some weird url', title: 'National Youth Orchestra' },
    ],
  })
})

test('rename page - deep nesting', async t => {
  const contentPath = tempy.directory()
  console.log(contentPath)
  const c = await Contentbot({ schema, contentPath })
  const setup = await graphql(
    c,
    `
      mutation {
        writeFilm(
          content: {
            url: "/deep/nested/films/national-youth-orchestra"
            title: "National Youth Orchestra"
          }
        ) {
          url
          title
        }
      }
    `
  )
  t.falsy(setup.errors)
  const mutation = await graphql(
    c,
    `
      mutation {
        rename(
          from: "/deep/nested/films/national-youth-orchestra"
          to: "/super/deep/nested/stuff"
        ) {
          url
          title
        }
      }
    `
  )
  t.falsy(mutation.errors)
  t.deepEqual(mutation.data.rename, {
    url: '/super/deep/nested/stuff',
    title: 'National Youth Orchestra',
  })
  // Check that old nested pages aren't left over
  const query = await graphql(
    c,
    `
      query {
        pages {
          url
          title
        }
      }
    `
  )
  t.falsy(query.errors)
  console.log(query.data)
  t.deepEqual(query.data, {
    pages: [
      { url: '/', title: null },
      { url: '/super', title: null },
      { url: '/super/deep', title: null },
      { url: '/super/deep/nested', title: null },
      { url: '/super/deep/nested/stuff', title: 'National Youth Orchestra' },
    ],
  })
})
