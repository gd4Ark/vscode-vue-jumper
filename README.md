<!--
 * @Author: atdow
 * @Date: 2022-11-01 21:07:59
 * @LastEditors: null
 * @LastEditTime: 2022-11-03 22:14:51
 * @Description: file description
-->

# vscode-vue-jumper

vue文件跳转到文件定义支持。支持标签跳转、import相对路径文件跳转、import别名路径文件跳转。

## 1. 标签跳转

支持大驼峰组件、中划线组件。

```html
<my-component></my-component>
<MyComponent></MyComponent>
```

## 2. import相对路径文件跳转

```js
import MyComponent form '../../component/MyComponent'
import MyComponent2 form '../../component/MyComponent2.vue'
```

## 3. import别名路径文件跳转

```js
import MyComponent form '@/component/MyComponent'
```

默认配置了 `@:src` ，如果有需要，请到插件配置中设置aliasConfigs：

格式： `别名名称:目标路径`

## 版本

* 1.3.0 修复匹配错误
* 1.2.0 增加组件重命名跳转
* 1.1.0 支持多workspaceFolders工作区跳转
* 1.0.0 支持基础跳转
