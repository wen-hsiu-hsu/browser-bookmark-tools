'use strict';

/**
 * 讓舊版 FM 書籤的測試也能套用到 fm-tools 面板：
 * test/fm-tools.test.js 會先設定 global.__bmtFmTools 再 require 舊測試，
 * 此時 code() 改回傳「fm-tools 書籤 + 點擊對應按鈕」，其餘測試流程不變。
 */
var fs = require('fs');
var path = require('path');
var build = require('../scripts/build.js');

var tools = !!global.__bmtFmTools;
var TOOLS_SRC = fs.readFileSync(path.join(__dirname, '../bookmarks/fm-tools/source.js'), 'utf8');

/** 建置並回傳可直接 eval 的程式碼。cmd：fm-tools 中對應的指令 id。 */
var cache = {};

async function code(src, cmd) {
  var key = tools ? TOOLS_SRC : src;
  var url = cache[key] || (cache[key] = await build.toBookmarklet(key));
  var out = decodeURIComponent(url.slice('javascript:'.length));
  if (tools) out += ';document.querySelector(\'#__bmt_fm_tools__ [data-__bmt_cmd="' + cmd + '"]\').click();';
  return out;
}

module.exports = { tools: tools, code: code, label: tools ? '[fm-tools] ' : '' };
