# Contentbot

**Under construction, use at your own risk. This repo does not respect semver (yet) - things may break at any time.**

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
type About implements Page {
  url: String!
  title: String
  bio: String
}

input AboutInput {
  url: String!
  title: String
  bio: String
}

type Film implements Page {
  url: String!
  title: String
  role: String
  pitch: String
  description: String
  youtubeUrl: String
}

input FilmInput {
  url: String!
  title: String
  role: String
  pitch: String
  description: String
  youtubeUrl: String
}

type GenericPage implements Page {
  url: String!
  title: String
}

type Mutation {
  writeAbout(content: AboutInput): About
  writeFilm(content: FilmInput): Film
}

interface Page {
  url: String!
  title: String
}

type Query {
  """
  This field does not do anything. It is required because there is currently no other way to add a type to the schema.
  """
  _ignore: GenericPage
  page(url: String!): Page
  pages: [Page]
  allAbouts: [About]
  allFilms: [Film]
}
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

### 3. Start querying it from your frontend!

For example, to add a new film page:

```graphql
mutation {
  writeFilm(content: {url: "/film/national-youth-orchestra", title: "Meet the National Youth Orchestra of Great Britain", youtubeUrl: "https://www.youtube.com/watch?v=uv2Y4AoWA-w"}) {
    url
  }
}
```

You can then get the film page like this:

```graphql
query {
  page(url: "/film/national-youth-orchestra") {
    url
    title
    ... on Film {
      youtubeUrl
    }
  }
}
```

Notice that the query uses an [inline fragment](http://graphql.org/learn/queries/#inline-fragments), which is required to get the type-specific custom fields. You can also define multiple inline fragments, so you could reuse the same query for different page types, for example:

```graphql
query AnyPage($url: String!) {
  page(url: $url) {
    __typename
    url
    title
    ... on Film {
      youtubeUrl
    }
    ... on About {
      bio
    }
  }
}
```

You could then check the `__typename` field, and render different templates for different types of pages.