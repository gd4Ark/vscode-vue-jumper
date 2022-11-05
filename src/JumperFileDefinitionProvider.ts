/*
 * @Author: atdow
 * @Date: 2017-08-21 14:59:59
 * @LastEditors: null
 * @LastEditTime: 2022-11-05 19:06:15
 * @Description: file description
 */
import * as vscode from 'vscode'
const util = require('./util')
const fs = require('fs')
import { IAliasConfigsItem, ILineInfo } from './types'

export default class JumperFileDefinitionProvider implements vscode.DefinitionProvider {
  targetFileExtensions: string[] = []
  aliasConfigs: IAliasConfigsItem[] = []

  constructor(targetFileExtensions: string[] = [], aliasConfigs: string[] = []) {
    this.targetFileExtensions = targetFileExtensions
    aliasConfigs.forEach((aliasConfigsItem) => {
      try {
        const aliasConfigsItemArr: string[] = aliasConfigsItem.split(':')
        if (aliasConfigsItemArr && aliasConfigsItemArr.length === 2) {
          this.aliasConfigs.push({
            alias: aliasConfigsItemArr[0],
            target: aliasConfigsItemArr[1]
          })
        }
      } catch (error) {
        // console.log("aliasConfigs:", aliasConfigs);
      }
    })
  }

  async judeLineType(line: String, keyword: string, document: vscode.TextDocument): Promise<ILineInfo> {
    const that = this
    const lineInfo: ILineInfo = {
      type: '',
      path: '',
      originPath: ''
    }
    if (!line) {
      return lineInfo
    }
    const pureLine: string = line.trim()
    const importObj: object = util.documentFindAllImport(
      document.getText(),
      that.aliasConfigs,
      document.uri.fsPath
      // (document.uri ? document.uri : document).fsPath
    )
    // console.log('importObj:', importObj)
    const registerComponentsObj: object = util.documentFindRegisterComponentsObj(document.getText()) || {}
    // import 类型
    if (pureLine.startsWith('import')) {
      lineInfo.type = 'import'
      this.componentNameInImportObjUpdateLineInfo(keyword, importObj, lineInfo)
    }
    // 标签类型
    if (pureLine.startsWith('<')) {
      lineInfo.type = 'tag'
      let searchComponentName: string = util.upperCamelCaseTagName(keyword)
      // 直接从importObj中查找
      this.componentNameInImportObjUpdateLineInfo(searchComponentName, importObj, lineInfo)
      // 从components中查找(组件重命名情况) components: { RenameMyComponent: MyComponent, 's-my-component2': MyComponent2 }
      if (!lineInfo.path) {
        Object.keys(registerComponentsObj).forEach((key) => {
          if (key === searchComponentName || key === keyword) {
            searchComponentName = registerComponentsObj[key]
          }
        })
        this.componentNameInImportObjUpdateLineInfo(searchComponentName, importObj, lineInfo)
      }
      // 从mixins中找
      if (!lineInfo.path) {
        const mixins: string[] = util.documentFindMixins(document.getText()) || []
        // console.log('mixins:', mixins)
        for (let i = mixins.length - 1; i >= 0; i--) {
          // 从后面往前找，如果找到了就不再找了
          if (lineInfo.path) {
            break
          }
          let mixinsPath: string = importObj[mixins[i]].path
          const mixinsPathArr: Thenable<vscode.Uri[]>[] = []
          if (!mixinsPath.endsWith('.js') && !mixinsPath.endsWith('.ts')) {
            mixinsPathArr.push(this.searchFilePath(`${mixinsPath}.js`))
            mixinsPathArr.push(this.searchFilePath(`${mixinsPath}.ts`))
          } else {
            mixinsPathArr.push(this.searchFilePath(`${mixinsPath}`))
          }
          const mixinsFilePathArr: Array<vscode.Uri[]> = (await Promise.all(mixinsPathArr)) || []
          mixinsFilePathArr.forEach((resItem) => {
            if (resItem.length === 0) {
              return
            }
            const mixinsFilePath: vscode.Uri = resItem[0]
            let readFileSyncFormatFilePath: string = mixinsFilePath.path
            if (util.isWindows()) {
              // /c:/code/xxx/src/views/mixins1.js ==> c://code//xxx//src//views//mixins1.js
              readFileSyncFormatFilePath = readFileSyncFormatFilePath.slice(1).replace(/\//g, '//')
            }
            let file: string = fs.readFileSync(readFileSyncFormatFilePath, { encoding: 'utf-8' })
            if (!file) {
              return
            }
            let documentFindAllImportFormatPath: string = mixinsFilePath.path
            if (util.isWindows()) {
              // /c:/code/xxx/src/views/mixins1.js => c:/code/xxx/src/views/mixins1.js 为了让documentFindAllImport方法保持一致
              documentFindAllImportFormatPath = documentFindAllImportFormatPath.slice(1)
            }
            const mixinsFileImportObj: object = util.documentFindAllImport(
              file,
              that.aliasConfigs,
              documentFindAllImportFormatPath
            )
            const mixinsFileRegisterComponentsObj: object = util.documentFindRegisterComponentsObj(file) || {}
            let searchComponentName: string = util.upperCamelCaseTagName(keyword)
            Object.keys(mixinsFileRegisterComponentsObj).forEach((key) => {
              if (key === searchComponentName || key === keyword) {
                searchComponentName = mixinsFileRegisterComponentsObj[key]
              }
            })
            this.componentNameInImportObjUpdateLineInfo(searchComponentName, mixinsFileImportObj, lineInfo)
          })
        }
      }
    }
    return lineInfo
  }
  /**
   * 从importObj找到对应的componentName信息，并用来更新lineInfo
   * @param componentName
   * @param importObj
   * @param lineInfo
   */
  componentNameInImportObjUpdateLineInfo(componentName: string, importObj: object, lineInfo: ILineInfo) {
    Object.keys(importObj).forEach((key) => {
      if (key === componentName) {
        lineInfo.originPath = importObj[componentName].originPath
        lineInfo.path = importObj[componentName].path
      }
    })
  }

  getComponentName(position: vscode.Position, document: vscode.TextDocument): Promise<string[]> {
    const doc: vscode.TextDocument = vscode.window.activeTextEditor.document
    const selection: vscode.Range = doc.getWordRangeAtPosition(position)
    const selectedText: string = doc.getText(selection)
    let lineText: string = doc.lineAt(position).text
    return this.judeLineType(lineText, selectedText, document)
      .then((res: ILineInfo) => {
        const { type, path, originPath } = res
        let possibleFileNames: string[] = []
        if (type === 'import' || type === 'tag') {
          possibleFileNamesAdd(path)
        }
        function possibleFileNamesAdd(originPath) {
          // 通过常规的方法都无法找到，只能退而其次地模糊去全局文件中找
          if (!path) {
            const upperCamelCaseTagName = util.upperCamelCaseTagName(selectedText)
            possibleFileNames.push(upperCamelCaseTagName + '.vue')
            possibleFileNames.push(upperCamelCaseTagName + '/index.vue')
            possibleFileNames.push(upperCamelCaseTagName + '/index.js')
            possibleFileNames.push(selectedText + '.vue')
            possibleFileNames.push(selectedText + '/index.vue')
            possibleFileNames.push(selectedText + '/index.js')
            return
          }
          if (!path.endsWith('.vue')) {
            possibleFileNames.push(path + '.vue')
            possibleFileNames.push(path + '/index.vue')
          }
          if (!path.endsWith('.js')) {
            possibleFileNames.push(path + '.js')
            possibleFileNames.push(path + '/index.js')
          }
          if (!path.endsWith('.jsx')) {
            possibleFileNames.push(path + '.jsx')
            possibleFileNames.push(path + '/index.jsx')
          }
          possibleFileNames.push(path)
        }

        return possibleFileNames
      })
      .catch(() => {
        return []
      })
  }

  searchFilePath(fileName: String): Thenable<vscode.Uri[]> {
    return vscode.workspace.findFiles(`**/${fileName}`, '**/node_modules') // Returns promise
  }

  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Location | vscode.Location[]> {
    let filePaths = []
    return this.getComponentName(position, document).then((componentNames) => {
      // console.log("componentNames:", componentNames);
      const searchPathActions = componentNames.map(this.searchFilePath)
      const searchPromises = Promise.all(searchPathActions) // pass array of promises
      return searchPromises.then(
        (paths) => {
          filePaths = [].concat.apply([], paths)

          if (filePaths.length) {
            let allPaths: vscode.Location[] = []
            filePaths.forEach((filePath) => {
              allPaths.push(new vscode.Location(vscode.Uri.file(`${filePath.path}`), new vscode.Position(0, 1)))
            })
            return allPaths
          } else {
            return undefined
          }
        },
        (reason) => {
          return undefined
        }
      )
    })
  }
}
