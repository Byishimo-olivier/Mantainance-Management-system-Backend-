const fs = require('fs');
const path = require('path');

async function tryRequire(name) {
  try {
    return require(name);
  } catch (e) {
    return null;
  }
}

function extractEmailsAndNamesFromText(text) {
  if (!text) return [];
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
  const members = [];
  const seen = new Set();
  for (const line of lines) {
    const emailMatch = line.match(emailRegex);
    if (emailMatch) {
      const email = emailMatch[0].toLowerCase();
      if (seen.has(email)) continue;
      seen.add(email);
      // Try to extract a name from the part before the email if present
      const before = line.split(email)[0].replace(/[,:\-\(\)\[\]\"]+/g, ' ').trim();
      const name = before.split(/\s{2,}|,|;|\|/).map(s=>s.trim()).filter(Boolean).slice(0,3).join(' ') || undefined;
      members.push({ name, email });
    }
  }
  // Fallback: if no emails found, treat each line as a name
  if (members.length === 0) {
    for (const line of lines) {
      const key = line.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      members.push({ name: line });
    }
  }
  return members;
}

async function extractTextFromFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.csv' || ext === '.txt') {
    return fs.readFileSync(filePath, 'utf8');
  }

  if (ext === '.xlsx' || ext === '.xls') {
    const xlsx = await tryRequire('xlsx');
    if (!xlsx) return '';
    try {
      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
      return rows.map(r => r.join(' ')).join('\n');
    } catch (e) {
      return '';
    }
  }

  if (ext === '.pdf') {
    const pdf = await tryRequire('pdf-parse');
    if (!pdf) return '';
    try {
      const data = fs.readFileSync(filePath);
      const parsed = await pdf(data);
      return parsed.text || '';
    } catch (e) {
      return '';
    }
  }

  if (ext === '.docx' || ext === '.doc') {
    const mammoth = await tryRequire('mammoth');
    if (!mammoth) return '';
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value || '';
    } catch (e) {
      return '';
    }
  }

  // Images: try OCR using tesseract.js if available
  if (['.png', '.jpg', '.jpeg', '.tif', '.tiff', '.bmp'].includes(ext)) {
    const Tesseract = await tryRequire('tesseract.js');
    if (!Tesseract) return '';
    try {
      const { createWorker } = Tesseract;
      const worker = createWorker();
      await worker.load();
      await worker.loadLanguage('eng');
      await worker.initialize('eng');
      const { data: { text } } = await worker.recognize(filePath);
      await worker.terminate();
      return text || '';
    } catch (e) {
      return '';
    }
  }

  // Unknown extension: try reading as utf8
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    return '';
  }
}

async function extractMembersFromFiles(filePaths) {
  if (!Array.isArray(filePaths) || filePaths.length === 0) return [];
  const allMembers = [];
  const seenEmails = new Set();
  for (const p of filePaths) {
    try {
      const text = await extractTextFromFile(p);
      const members = extractEmailsAndNamesFromText(text || '');
      for (const m of members) {
        const key = (m.email || m.name || '').toLowerCase();
        if (!key) continue;
        if (seenEmails.has(key)) continue;
        seenEmails.add(key);
        allMembers.push(m);
      }
    } catch (e) {
      // ignore single-file errors
      console.warn('[extractMembersFromFiles] failed for', p, e && e.message);
    }
  }
  return allMembers;
}

module.exports = { extractMembersFromFiles };
