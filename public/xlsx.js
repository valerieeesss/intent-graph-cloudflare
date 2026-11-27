(() => {
  const encoder = new TextEncoder();
  const xml = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  const colName = n => { let out = ''; for (n++; n; n = Math.floor((n - 1) / 26)) out = String.fromCharCode(65 + ((n - 1) % 26)) + out; return out; };
  const cellXml = (value, ref, wrap, header) => {
    const style = header ? ' s="1"' : wrap ? ' s="2"' : '';
    if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"${style}><v>${value}</v></c>`;
    if (value == null || value === '') return `<c r="${ref}"${style}/>`;
    return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
  };
  const sheetXml = (rows, widths, wrapCols = []) => {
    const maxCol = Math.max(...rows.map(row => row.length));
    const cols = widths.map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`).join('');
    const data = rows.map((row, ri) => `<row r="${ri + 1}">${row.map((value, ci) => cellXml(value, `${colName(ci)}${ri + 1}`, ri > 0 && wrapCols.includes(ci), ri === 0)).join('')}</row>`).join('');
    const endCell = `${colName(maxCol - 1)}${rows.length}`;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${data}</sheetData><autoFilter ref="A1:${endCell}"/></worksheet>`;
  };
  const crc32 = bytes => {
    let crc = -1;
    for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0); }
    return (crc ^ -1) >>> 0;
  };
  const u16 = (view, offset, value) => view.setUint16(offset, value, true);
  const u32 = (view, offset, value) => view.setUint32(offset, value >>> 0, true);
  const concat = parts => { const total = parts.reduce((sum, part) => sum + part.length, 0), out = new Uint8Array(total); let offset = 0; for (const part of parts) { out.set(part, offset); offset += part.length; } return out; };
  function zip(files) {
    const local = [], central = []; let offset = 0;
    for (const [name, text] of files) {
      const filename = encoder.encode(name), content = encoder.encode(text), crc = crc32(content);
      const header = new Uint8Array(30 + filename.length), view = new DataView(header.buffer);
      u32(view, 0, 0x04034b50); u16(view, 4, 20); u16(view, 6, 0); u16(view, 8, 0); u16(view, 10, 0); u16(view, 12, 0x21); u32(view, 14, crc); u32(view, 18, content.length); u32(view, 22, content.length); u16(view, 26, filename.length); u16(view, 28, 0); header.set(filename, 30);
      local.push(header, content);
      const directory = new Uint8Array(46 + filename.length), dv = new DataView(directory.buffer);
      u32(dv, 0, 0x02014b50); u16(dv, 4, 20); u16(dv, 6, 20); u16(dv, 8, 0); u16(dv, 10, 0); u16(dv, 12, 0); u16(dv, 14, 0x21); u32(dv, 16, crc); u32(dv, 20, content.length); u32(dv, 24, content.length); u16(dv, 28, filename.length); u16(dv, 30, 0); u16(dv, 32, 0); u16(dv, 34, 0); u16(dv, 36, 0); u32(dv, 38, 0); u32(dv, 42, offset); directory.set(filename, 46); central.push(directory); offset += header.length + content.length;
    }
    const centralBytes = concat(central), centralOffset = offset, end = new Uint8Array(22), ev = new DataView(end.buffer);
    u32(ev, 0, 0x06054b50); u16(ev, 4, 0); u16(ev, 6, 0); u16(ev, 8, files.length); u16(ev, 10, files.length); u32(ev, 12, centralBytes.length); u32(ev, 16, centralOffset); u16(ev, 20, 0);
    return concat([...local, centralBytes, end]);
  }
  function roleLabel(role) {
    const labels = { 'tool/calculator': 'Tool > Calculator', 'guide/article': 'Article > Guide', product: 'Landing > Product', service: 'Landing > Service', hub: 'Landing > Hub', category: 'Landing > Category', application: 'Conversion > Application', support: 'Service > Support' };
    return labels[role] || role || 'Unclear';
  }
  function buildRows(data) {
    const header = ['Title', 'URL', 'Page type', 'Impressions (last 6 months)', 'Keywords (last 6 months)', 'Top keyword', 'Top keyword: Volume', 'Top keyword: Position', 'Current Intent Ownership', 'Problem', 'Optimisation Needed?', 'Issue tags', 'Recommended action', 'GSC clicks (last 6 months)', 'GSC clicks (earlier 3 months)', 'GSC clicks (latest 3 months)', 'GSC clicks change', 'Shared GSC queries (6-month page pairs)', 'Competing pages'];
    const rows = [header];
    for (const node of data.nodes || []) {
      const w = node.workbook || {}, a = w.ahrefs || {}, six = w.gsc_six_months || {}, old = w.gsc_previous_three_months || {}, recent = w.gsc_recent_three_months || {};
      const cannib = w.cannibalisation || [];
      const sharedCount = cannib.reduce((sum, item) => sum + (item.shared_query_count || 0), 0);
      const competitors = [...new Set(cannib.map(item => item.url).filter(Boolean))].join('\n');
      const gscAvailable = data.search_evidence?.status === 'available' || data.search_evidence?.status === 'no-matching-rows';
      rows.push([
        node.title, node.url, roleLabel(w.page_type || node.expected_role),
        gscAvailable ? six.impressions : 'Unavailable', gscAvailable ? six.queries : 'Unavailable',
        a.keyword || (a.status === 'not-configured' ? 'Ahrefs not configured' : a.status === 'unavailable' ? 'Unavailable' : 'No Ahrefs keyword found'), a.volume ?? 'Unavailable', a.position ?? 'Unavailable',
        w.current_intent_ownership || 'Unavailable', w.problem || '', w.optimisation_needed || 'Review', w.issue_tags || '', w.recommended_action || '',
        gscAvailable ? six.clicks : 'Unavailable', gscAvailable ? old.clicks : 'Unavailable', gscAvailable ? recent.clicks : 'Unavailable',
        gscAvailable ? (w.gsc_click_change_percent == null ? 'Not calculable' : `${w.gsc_click_change_percent}%`) : 'Unavailable',
        gscAvailable ? sharedCount : 'Unavailable', competitors || '—'
      ]);
    }
    return rows;
  }
  function buildMethodRows(data) {
    const w = data.report_method || {}, ahrefs = data.ahrefs_evidence || {}, search = data.search_evidence || {};
    return [
      ['Source / method', 'Details'],
      ['Generated', data.created_at || ''],
      ['Semantic analysis', `${data.intent_method || 'Unavailable'}; expected page role is inferred from URL slug; intent and role fulfilment use extracted page text.`],
      ['Search Console source', `${search.method || 'SEO Gets MCP'} — ${search.site || 'property unavailable'}`],
      ['SEO Gets status', `${search.status || 'Unavailable'}${search.message ? ` — ${search.message}` : ''}`],
      ['GSC date window', `${search.start_date || ''} to ${search.end_date || ''}; earlier three months compared with latest three months.`],
      ['Content decay flag', w.decay_threshold || 'Unavailable'],
      ['Cannibalisation signal', w.cannibalisation_method || 'Unavailable'],
      ['Ahrefs source', `Site Explorer Top Pages; country ${ahrefs.country || 'AU'}; average volume; date ${ahrefs.date || ''}.`],
      ['Ahrefs status', `${ahrefs.status || 'Unavailable'}${ahrefs.message ? ` — ${ahrefs.message}` : ''}`],
      ['Ahrefs API unit estimate', data.ahrefs_unit_estimate == null ? 'Unavailable' : `Approx. ${data.ahrefs_unit_estimate} units. Ahrefs pricing can vary by fields and result rows.`],
      ['Interpretation', 'Search overlap and declining clicks identify pages for review. They do not establish that cannibalisation or content changes caused a ranking or traffic loss.']
    ];
  }
  function workbookBytes(data) {
    const pages = buildRows(data), method = buildMethodRows(data);
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="10"/><name val="Aptos"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="10"/><name val="Aptos"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF24364B"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
    const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="pages and issues" sheetId="1" r:id="rId1"/><sheet name="Method and sources" sheetId="2" r:id="rId2"/></sheets></workbook>`;
    const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
    const bookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
    return zip([
      ['[Content_Types].xml', contentTypes], ['_rels/.rels', rootRels], ['xl/workbook.xml', workbook], ['xl/_rels/workbook.xml.rels', bookRels], ['xl/styles.xml', styles],
      ['xl/worksheets/sheet1.xml', sheetXml(pages, [32, 54, 21, 15, 14, 32, 17, 16, 48, 70, 22, 55, 75, 18, 20, 20, 19, 21, 54], [1, 8, 9, 11, 12, 18])],
      ['xl/worksheets/sheet2.xml', sheetXml(method, [30, 110], [1])]
    ]);
  }
  window.IntentGraphWorkbook = { create: workbookBytes };
})();
