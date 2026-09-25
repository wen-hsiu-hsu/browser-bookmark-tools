#!/usr/bin/env node
/**
 * 書籤建置：展開 @include → Terser 最小化（ES5）→ 產生可直接貼上的 javascript: 網址。
 *
 * 用法：npm run build -- <書籤資料夾名> [<書籤資料夾名> ...]
 * 輸出：bookmarks/<name>/bookmarklet.txt
 */
'use strict';

var fs = require('fs');
var path = require('path');
var terser = require('terser');

var ROOT = path.join(__dirname, '..');
var SHARED = path.join(ROOT, 'shared');
var BOOKMARKS = path.join(ROOT, 'bookmarks');

var INCLUDE_RE = /\/\*\s*@include\s+([\w-]+)\s*\*\//g;

/** 將 /* @include name *\/ 換成 shared/name.js 的內容；同一元件只展開一次。 */
function expandIncludes(src) {
  var seen = {};
  return src.replace(INCLUDE_RE, function (_, name) {
    if (seen[name]) return '';
    seen[name] = true;
    var file = path.join(SHARED, name + '.js');
    if (!fs.existsSync(file)) throw new Error('找不到共用元件：shared/' + name + '.js');
    return fs.readFileSync(file, 'utf8');
  });
}

/** 讀取原始碼開頭註解的 @tag 值。 */
function readTag(src, tag) {
  var m = src.match(new RegExp('@' + tag + '\\s+(.+)'));
  return m ? m[1].trim() : null;
}

/** 最小化並轉成 javascript: 網址。 */
async function toBookmarklet(src) {
  var result = await terser.minify(expandIncludes(src), {
    ecma: 5,
    compress: { passes: 2 },
    mangle: true,
    format: { comments: false }
  });
  // 瀏覽器執行 javascript: 網址前會先做百分比解碼，% 必須先跳脫
  return 'javascript:' + result.code.replace(/%/g, '%25');
}

async function build(name) {
  var dir = path.join(BOOKMARKS, name);
  var srcFile = path.join(dir, 'source.js');
  if (!fs.existsSync(srcFile)) throw new Error('找不到 ' + path.relative(ROOT, srcFile));

  var src = fs.readFileSync(srcFile, 'utf8');
  var version = readTag(src, 'version');
  if (!version) throw new Error(name + '：source.js 缺少 @version');

  var out = await toBookmarklet(src);
  fs.writeFileSync(path.join(dir, 'bookmarklet.txt'), out + '\n');
  console.log('✔ ' + name + ' v' + version + '（' + out.length + ' 字元）');

  var readme = path.join(dir, 'README.md');
  if (!fs.existsSync(readme) || fs.readFileSync(readme, 'utf8').indexOf('v' + version) < 0) {
    console.warn('⚠ ' + name + '：README.md 沒有提到 v' + version + '，請更新文件與版本紀錄');
  }
}

async function main() {
  var names = process.argv.slice(2);
  if (!names.length) {
    console.error('用法：npm run build -- <書籤資料夾名> [...]');
    process.exit(1);
  }
  for (var i = 0; i < names.length; i++) {
    try {
      await build(names[i]);
    } catch (e) {
      console.error('✘ ' + names[i] + '：' + e.message);
      process.exitCode = 1;
    }
  }
}

if (require.main === module) main();

module.exports = { expandIncludes: expandIncludes, readTag: readTag, toBookmarklet: toBookmarklet };
