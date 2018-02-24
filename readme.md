# Contentbot

GraphQL schema & API for creating/reading/updating/deleting pages in a static website which stores pages in a simple format on the file system, similarly to [Kirby](https://getkirby.com/docs/content/adding-content).

## Usage

### 1. Define your schema

Define a file `site.graphql` containing the types of pages that your site should support:

```
type About implements Page {
  url: String!
  title: String!
  bio: String
}

type Film implements Page {
  url: String!
  title: String!
  role: String
  pitch: String
  description: String
  youtubeUrl: String
}
```

If the type implements the interface `Page`, it will become a page, and will need non-nullable `url` and `title` fields.
You can add other helper types that are not `Page`s.

You will not be able to add any arguments to the fields.

Contentbot generates the following GraphQL schema:

```
schema {
  query: Query
  mutation: Mutation
}

type Query {
  pages: [Page!]!
  allAbouts: [About!]!
  allFilms: [Film!]!
}

type Mutation {
  createAbout(url: String!, input: AboutInput): About
  readAbout(url: String!): About
  updateAbout(url: String!, input: AboutInput): About
  deleteAbout(url: String!): About

  createFilm(url: String!, input: FilmInput): Film
  readFilm(url: String!): Film
  updateFilm(url: String!, input: FilmInput): Film
  deleteFilm(url: String!): Film
}

type Page {
  url: String!
  title: String!
}

input type AboutInput {
  url: String
  title: String
  bio: String
}

input type FilmInput {
  url: String
  title: String
  role: String
  pitch: String
  description: String
  youtubeUrl: String
}

# + user-generated types
```

For every type in `site.graphql`, it will create a set of CRUD mutations, and a corresponding input type.

### 2. Serve the schema

eg. using `graphql-yoga`:

```js
const Contentbot = require('contentbot')
const GraphQLServer = require('graphql-yoga')

async function main() {
  const schema = await Contentbot('content')
  const server = new GraphQLServer({ schema })
  server.start()
}
main()
```
