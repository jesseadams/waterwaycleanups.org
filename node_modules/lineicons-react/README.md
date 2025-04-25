# Lineicons React - Essential UI Icons for React

Lineicons is the perfect icon library and pack for designers and developers seeking essential icons in React components. With a range of free icons available, it's the ultimate resource for creating beautiful and functional interfaces.

React Components for [Lineicons](https://lineicons.com)

### [Explore and Download All 5700+ Icons](https://lineicons.com/)

## Installation

lineicons-react is available as an [npm package](https://www.npmjs.com/package/lineicons-react).

```sh
npm install lineicons-react
```

or

```sh
yarn add lineicons-react
```

## Usage

### Using SVG icons

To use a SVG icon all you have to do is import it from **lineicons-react** and use it as shown below.

```js
import { Adobe } from "lineicons-react";

function App() {
  return (
    <div>
      <Adobe style={{ fill: "red", fontSize: "5rem" }} />
    </div>
  );
}

export default App;
```

### Using Icon Font

To use the Icon Font first import the CSS file into your Index.js file

```js
import "lineicons-react/dist/styles/styles.css";
```

Then Import LineIcon from Lineicon-react and use it.
After that add **name** and **variation** which is **lni** for free ones. These are the required props if you want you can add more using the style property.

```js
import { LineIcon } from "lineicons-react";

function App() {
  return (
    <div>
      <LineIcon
        name="adobe"
        variation="lni"
        style={{ fontSize: "1rem", color: "red" }}
      />
    </div>
  );
}

export default App;
```

### [Documentation](https://lineicons.com/docs)

[![lineicons-site](https://content.lineicons.com/wp-content/uploads/2023/01/lineicons-4.png)](https://lineicons.com/)

### [Lineicons Figma Plugin](https://www.figma.com/community/plugin/1217738304122072948/Lineicons)

### [Lineicons - Figma Source](https://www.figma.com/community/file/1198194066179400874)
