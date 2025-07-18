import a from './a.js'

var b = { name: 'b', dep: a && a.name }

export default b
