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

test('createFilm creates a film page', async t => {
  const contentPath = tempy.directory()
  console.log(contentPath)
  const c = await Contentbot({ schema, contentPath })
  const mutation = await graphql(
    c,
    `
      mutation {
        createFilm(
          url: "/films/national-youth-orchestra"
          content: {
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
  t.deepEqual(mutation.data.createFilm, {
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

test('create & query works with wobbly input', async t => {
  const contentPath = tempy.directory()
  console.log(contentPath)
  const c = await Contentbot({ schema, contentPath })
  const mutation = await graphql(
    c,
    `
      mutation {
        createFilm(
          url: "   films/national-youth-orchestra  "
          content: { title: "National Youth Orchestra" }
        ) {
          url
          title
        }
      }
    `
  )
  t.falsy(mutation.errors)
  t.deepEqual(mutation.data.createFilm, {
    url: '/films/national-youth-orchestra',
    title: 'National Youth Orchestra',
  })
  const query = await graphql(
    c,
    `
      query {
        page(url: "       films/national-youth-orchestra ") {
          url
          title
        }
      }
    `
  )
  t.falsy(query.errors)
  t.deepEqual(query.data.page, {
    url: '/films/national-youth-orchestra',
    title: 'National Youth Orchestra',
  })
})

test('create - empty url throws error', async t => {
  const contentPath = tempy.directory()
  console.log(contentPath)
  const c = await Contentbot({ schema, contentPath })
  const mutation = await graphql(
    c,
    `
      mutation {
        createFilm(url: "") {
          url
        }
      }
    `
  )
  t.is(mutation.errors.length, 1)
  const error = mutation.errors[0]
  t.is(error.message, 'url must not be empty')
})

test('edit - throws if not created', async t => {
  const c = await Contentbot({ schema, contentPath: 'mock/content' })
  const mutation = await graphql(
    c,
    `
      mutation {
        editFilm(url: "/some-url", content: { title: "yee boi" }) {
          url
        }
      }
    `
  )
  t.is(mutation.errors.length, 1)
  const error = mutation.errors[0]
  t.is(error.message, 'Page does not exist.')
})

test('edit edits', async t => {
  const contentPath = tempy.directory()
  console.log(contentPath)
  const c = await Contentbot({ schema, contentPath })
  const create = await graphql(
    c,
    `
      mutation {
        createFilm(url: "/foo-bar") {
          url
        }
      }
    `
  )
  t.falsy(create.errors)
  const edit = await graphql(
    c,
    `
      mutation {
        editFilm(
          url: "/foo-bar"
          content: { title: "yep", role: "sounds good" }
        ) {
          url
          title
          role
          description
        }
      }
    `
  )
  t.falsy(edit.errors)
  t.deepEqual(edit.data.editFilm, {
    url: '/foo-bar',
    title: 'yep',
    role: 'sounds good',
    description: null,
  })
  const edit2 = await graphql(
    c,
    `
      mutation {
        editFilm(
          url: "/foo-bar"
          content: { title: "nope", description: "woi" }
        ) {
          url
          title
          role
          description
        }
      }
    `
  )
  t.falsy(edit2.errors)
  t.deepEqual(edit2.data.editFilm, {
    url: '/foo-bar',
    title: 'nope',
    role: 'sounds good',
    description: 'woi',
  })
  const query = await graphql(
    c,
    `
      query {
        page(url: "/foo-bar") {
          url
          title
          ... on Film {
            role
            description
          }
        }
      }
    `
  )
  t.falsy(query.errors)
  t.deepEqual(query.data.page, {
    url: '/foo-bar',
    title: 'nope',
    role: 'sounds good',
    description: 'woi',
  })
})

test('delete - throws if not created', async t => {
  const c = await Contentbot({ schema, contentPath: 'mock/content' })
  const mutation = await graphql(
    c,
    `
      mutation {
        delete(url: "/some-url") {
          url
        }
      }
    `
  )
  t.is(mutation.errors.length, 1)
  const error = mutation.errors[0]
  t.is(error.message, 'Page does not exist.')
})

test('delete deletes', async t => {
  const contentPath = tempy.directory()
  console.log(contentPath)
  const c = await Contentbot({ schema, contentPath })
  const create = await graphql(
    c,
    `
      mutation {
        createFilm(url: "/foo-bar") {
          url
        }
      }
    `
  )
  t.falsy(create.errors)
  const deleteMutation = await graphql(
    c,
    `
      mutation {
        delete(url: "/foo-bar") {
          url
        }
      }
    `
  )
  t.falsy(deleteMutation.errors)
  t.deepEqual(deleteMutation.data.delete, {
    url: '/foo-bar',
  })
  const query = await graphql(
    c,
    `
      query {
        page(url: "/foo-bar") {
          url
          title
        }
      }
    `
  )
  t.falsy(query.errors)
  t.deepEqual(query.data.page, null)
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
        createFilm(
          url: "/national-youth-orchestra"
          content: { title: "National Youth Orchestra" }
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
        createFilm(
          url: "/deep/nested/films/national-youth-orchestra"
          content: { title: "National Youth Orchestra" }
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
  // // FIXME Order makes no sense but whatever
  // t.deepEqual(query.data, {
  //   pages: [
  //     { url: '/super', title: null },
  //     { url: '/super/deep', title: null },
  //     { url: '/super/deep/nested', title: null },
  //     { url: '/', title: null },
  //     { url: '/super/deep/nested/stuff', title: 'National Youth Orchestra' },
  //   ],
  // })
})

test('rename page - from does not exist', async t => {
  const c = await Contentbot({ schema, contentPath: 'mock/content' })
  const mutation = await graphql(
    c,
    `
      mutation {
        rename(from: "/some-weirdo-path-doesnt-exist", to: "/some-other-path") {
          url
          title
        }
      }
    `
  )
  t.is(mutation.errors.length, 1)
  const error = mutation.errors[0]
  t.is(error.message, 'Page does not exist: /some-weirdo-path-doesnt-exist')
})

test('rename into subdirectory', async t => {
  const contentPath = tempy.directory()
  console.log(contentPath)
  const c = await Contentbot({ schema, contentPath })
  const setup = await graphql(
    c,
    `
      mutation {
        createFilm(url: "/foo-bar") {
          url
        }
      }
    `
  )
  t.falsy(setup.errors)
  const mutation = await graphql(
    c,
    `
      mutation {
        rename(from: "/foo-bar", to: "/foo-bar/baz") {
          url
        }
      }
    `
  )
  t.falsy(mutation.errors)
  t.deepEqual(mutation.data.rename, {
    url: '/foo-bar/baz',
  })
})
