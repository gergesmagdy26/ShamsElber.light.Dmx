/**
 * ShamsElber light. DMX — Shared Offline Export & Print Engine
 * Supports:
 * - Dynamic Empty-Column Filtering (Section 3.1 & 4.1)
 * - A4 + Thermal Receipt Printer 80mm & 58mm Layouts (Section 4.2)
 * - Offline Image Export (PNG / JPG via SVG foreignObject -> Canvas)
 * - Offline Excel (.xls / .xlsx HTML Workbook + UTF-8 BOM CSV)
 * - Offline Word (.doc MSO HTML Document)
 */
(function (global) {
  'use strict';

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function isValuePopulated(val) {
    if (val === null || val === undefined) return false;
    const s = String(val).trim();
    if (!s || s === '-' || s === '—' || s === 'N/A' || s === 'null' || s === 'undefined') return false;
    return true;
  }

  /**
   * Filters columns array [{ key, label, ... }] so ONLY columns that have at least
   * one non-empty value in `rows` are returned (Section 3.1 & 4.1).
   */
  function filterEmptyColumns(columns, rows) {
    if (!Array.isArray(columns) || !Array.isArray(rows) || rows.length === 0) {
      return columns || [];
    }
    return columns.filter((col) => {
      if (col.alwaysShow) return true;
      return rows.some((row) => {
        const val = typeof col.getter === 'function' ? col.getter(row) : row[col.key];
        return isValuePopulated(val);
      });
    });
  }

  /**
   * Builds a unified header block for printed / exported sheets using App Settings
   * (Uploaded App Logo + Company / DOP / Lighting Designer + Date), hiding empty fields.
   */
  function buildSheetHeaderHTML(opts = {}) {
    const settings =
      (global.CineLightDB && typeof global.CineLightDB.getAppSettingsSync === 'function'
        ? global.CineLightDB.getAppSettingsSync()
        : {}) || {};
    const logoSrc = settings.logoDataURL || './FB_IMG_1794520985975.jpg';
    const title = opts.title || 'ShamsElber light. DMX';
    const subtitle = opts.subtitle || '';
    const metaChips = [];

    if (isValuePopulated(settings.companyName)) {
      metaChips.push(`<span><strong>Production:</strong> ${escapeHtml(settings.companyName)}</span>`);
    }
    if (isValuePopulated(opts.dop || settings.dopName)) {
      metaChips.push(`<span><strong>DOP:</strong> ${escapeHtml(opts.dop || settings.dopName)}</span>`);
    }
    if (isValuePopulated(opts.designer || settings.designerName)) {
      metaChips.push(`<span><strong>Lighting / DMX:</strong> ${escapeHtml(opts.designer || settings.designerName)}</span>`);
    }
    if (isValuePopulated(opts.venueName)) {
      metaChips.push(`<span><strong>Venue:</strong> ${escapeHtml(opts.venueName)}</span>`);
    }
    if (isValuePopulated(opts.sceneName)) {
      metaChips.push(`<span><strong>Scene:</strong> ${escapeHtml(opts.sceneName)}</span>`);
    }
    const dateStr = new Date().toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
    metaChips.push(`<span><strong>Date:</strong> ${escapeHtml(dateStr)}</span>`);

    return `
      <div class="shams-sheet-header" style="display:flex;align-items:center;justify-content:space-between;gap:14px;border-bottom:2.5px solid #0f172a;padding-bottom:10px;margin-bottom:12px;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:12px;">
          <img src="${logoSrc}" alt="Logo" style="width:46px;height:46px;object-fit:contain;border-radius:8px;border:1px solid #cbd5e1;background:#fff;padding:2px;" />
          <div>
            <div style="font-size:16pt;font-weight:900;color:#0f172a;line-height:1.15;">${escapeHtml(title)}</div>
            ${subtitle ? `<div style="font-size:9.5pt;font-weight:700;color:#334155;margin-top:2px;">${escapeHtml(subtitle)}</div>` : ''}
          </div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:10px;font-size:8.5pt;color:#0f172a;">
          ${metaChips.join(' • ')}
        </div>
      </div>
    `;
  }

  /**
   * Print HTML in A4, Thermal 80mm, or Thermal 58mm format (Section 4.2)
   */
  function print(htmlContent, opts = {}) {
    const settings =
      (global.CineLightDB && typeof global.CineLightDB.getAppSettingsSync === 'function'
        ? global.CineLightDB.getAppSettingsSync()
        : {}) || {};
    const format = opts.format || settings.printFormat || 'A4';
    const orientation = opts.orientation === 'landscape' ? 'landscape' : 'portrait';
    const isThermal80 = format === 'thermal80';
    const isThermal58 = format === 'thermal58';
    const isThermal = isThermal80 || isThermal58;
    const rollWidth = isThermal58 ? '58mm' : '80mm';
    const printableWidth = isThermal58 ? '48mm' : '72mm';
    const docTitle = opts.title || 'ShamsElber light. DMX — Print Sheet';

    const pageCss = isThermal
      ? `
        @page { size: ${rollWidth} auto; margin: 2mm 1.5mm; }
        html, body {
          width: ${printableWidth};
          max-width: ${printableWidth};
          margin: 0 auto !important;
          padding: 1.5mm 1mm !important;
          background: #ffffff !important;
          color: #000000 !important;
          font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
          font-size: ${isThermal58 ? '7.5pt' : '8.5pt'};
          line-height: 1.25;
          overflow-x: hidden !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        * { box-sizing: border-box; color: #000000 !important; max-width: 100% !important; }
        .paper-sheet-surface, .project-dmx-paper-sheet {
          width: 100% !important;
          max-width: 100% !important;
          padding: 0 !important;
          margin: 0 !important;
          box-shadow: none !important;
          border: none !important;
        }
        .shams-sheet-header {
          flex-direction: column !important;
          align-items: center !important;
          text-align: center !important;
          gap: 3px !important;
          border-bottom: 2px solid #000 !important;
          padding-bottom: 4px !important;
          margin-bottom: 6px !important;
        }
        .shams-sheet-header img, .sheet-header-table img { width: 28px !important; height: 28px !important; max-height: 28px !important; }
        .sheet-header-table, .sheet-header-table tbody, .sheet-header-table tr, .sheet-header-table td {
          display: block !important;
          width: 100% !important;
          border: none !important;
          text-align: center !important;
          padding: 1px 0 !important;
        }
        .sheet-header-table { border-bottom: 2px solid #000 !important; margin-bottom: 6px !important; padding-bottom: 4px !important; }
        h1, h2, h3, h4 {
          font-size: ${isThermal58 ? '8.5pt' : '9.5pt'} !important;
          margin: 4px 0 !important;
          word-break: break-word !important;
          white-space: normal !important;
        }
        .dmx-split-table, .dmx-split-table > tbody, .dmx-split-table > tbody > tr, .dmx-split-col {
          display: block !important;
          width: 100% !important;
          border: none !important;
          padding: 0 !important;
          margin: 0 0 6px 0 !important;
          border-spacing: 0 !important;
        }
        .dmx-split-grid { display: flex !important; flex-direction: column !important; gap: 4px !important; border: none !important; }
        .dmx-split-divider { display: none !important; }
        .dmx-universe-banner {
          background: #e2e8f0 !important;
          color: #000000 !important;
          font-weight: 900 !important;
          font-size: ${isThermal58 ? '8pt' : '9pt'} !important;
          padding: 3px 4px !important;
          text-align: center !important;
          border-bottom: 1.5px solid #000 !important;
        }
        table {
          width: 100% !important;
          max-width: 100% !important;
          border-collapse: collapse !important;
          table-layout: auto !important;
          margin: 0 0 6px 0 !important;
        }
        th, td {
          border: 1px solid #000 !important;
          padding: ${isThermal58 ? '2px 2px' : '3px 3px'} !important;
          font-size: ${isThermal58 ? '6.4pt' : '7.4pt'} !important;
          width: auto !important;
          min-width: 0 !important;
          max-width: none !important;
          white-space: normal !important;
          word-break: break-word !important;
          overflow-wrap: anywhere !important;
          text-align: right;
          background: #fff !important;
          line-height: 1.2 !important;
        }
        th { background: #e2e8f0 !important; font-weight: 900 !important; text-align: center !important; }
        img { max-width: 100% !important; height: auto !important; }
      `
      : `
        @page { size: A4 ${orientation}; margin: 9mm; }
        html, body {
          margin: 0;
          padding: 0;
          background: #ffffff !important;
          color: #0f172a !important;
          font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
          font-size: 9.2pt;
          line-height: 1.35;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        * { box-sizing: border-box; }
        .print-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          border-bottom: 2.5px solid #0f172a;
          padding-bottom: 8px;
          margin-bottom: 10px;
          direction: rtl;
        }
        .print-plot-img {
          display: block;
          width: 100%;
          max-width: 100%;
          max-height: ${orientation === 'landscape' ? '115mm' : '135mm'};
          margin: 0 auto 10px auto;
          object-fit: contain;
          border: 1.5px solid #334155;
          border-radius: 6px;
          background: transparent;
          page-break-inside: avoid;
        }
        .print-plot-img.print-plot-img-full {
          width: 100%;
          height: ${orientation === 'landscape' ? '136mm' : '212mm'};
          max-height: ${orientation === 'landscape' ? '138mm' : '214mm'};
          margin: 2px auto 0 auto;
          object-fit: fill;
        }
        .print-crew-wrap { margin: 0 0 10px 0; }
        .print-crew-table { width: 100% !important; table-layout: fixed !important; border-collapse: collapse !important; margin-bottom: 4px !important; }
        .print-crew-table td {
          border: 1.2px solid #94a3b8 !important;
          background: #f8fafc !important;
          color: #0f172a !important;
          padding: 5px 8px !important;
          text-align: center !important;
          vertical-align: middle !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .project-dmx-paper-sheet { padding: 0; background: #ffffff; color: #0f172a; direction: rtl; }
        .dmx-universe-banner {
          font-weight: 900;
          border: 1.5px solid #0f172a;
          border-bottom: none;
          padding: 5px 8px;
          font-size: 9pt;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .dmx-inner-table { width: 100%; table-layout: fixed; border-collapse: collapse; margin-bottom: 0; }
        .print-table { width: 100%; max-width: 100%; table-layout: fixed; border-collapse: collapse; margin-bottom: 12px; }
        .print-table th, .print-table td, .dmx-inner-table th, .dmx-inner-table td {
          border: 1.2px solid #0f172a;
          padding: 4px 5px;
          font-size: 8.6pt;
          line-height: 1.3;
          word-break: break-word;
          overflow-wrap: anywhere;
          white-space: normal;
        }
        table { width: 100%; max-width: 100%; table-layout: fixed; border-collapse: collapse; margin-bottom: 10px; }
        th, td { border: 1.2px solid #0f172a; padding: 5px 6px; font-size: 9pt; text-align: right; line-height: 1.32; word-break: break-word; overflow-wrap: anywhere; white-space: normal; box-sizing: border-box; }
        th { background: #e2e8f0 !important; color: #0f172a !important; font-weight: 800; }
        .sheet-header-table, .sheet-header-table td { border: none !important; background: transparent !important; }
        .sheet-header-table { border-bottom: 2.5px solid #0f172a !important; margin-bottom: 12px !important; }
        .dmx-split-table { width: 100%; max-width: 100%; table-layout: fixed !important; border-collapse: separate !important; border-spacing: 6px 0 !important; border: none !important; margin-bottom: 10px; }
        .dmx-split-col { width: 50%; max-width: 50%; vertical-align: top; padding: 0 !important; border: none !important; background: #ffffff !important; overflow: hidden; }
        .dmx-split-grid { display: flex; flex-direction: row; gap: 0; align-items: stretch; border: 2px solid #0f172a; }
        img { max-width: 100%; height: auto; }
      `;

    const existingFrame = document.getElementById('shamsHiddenPrintFrame');
    if (existingFrame) existingFrame.remove();

    const iframe = document.createElement('iframe');
    iframe.id = 'shamsHiddenPrintFrame';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(`<!DOCTYPE html><html dir="${opts.dir || 'rtl'}"><head><meta charset="utf-8"><title>${escapeHtml(docTitle)}</title><style>${pageCss}</style></head><body>${htmlContent}</body></html>`);
    doc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch (e) {
        window.print();
      }
    }, 320);
  }

  /**
   * Offline HTML/Element -> PNG or JPG Image Exporter via SVG <foreignObject> + Canvas
   */
  async function exportImage(elementOrHtml, opts = {}) {
    const type = (opts.type || 'png').toLowerCase() === 'jpg' ? 'jpg' : 'png';
    const mime = type === 'jpg' ? 'image/jpeg' : 'image/png';
    const filename = opts.filename || `ShamsElber_Sheet_${Date.now()}.${type}`;

    let htmlStr = '';
    const hasOrient = opts.orientation === 'landscape' || opts.orientation === 'portrait';
    const isLandscape = opts.orientation === 'landscape';
    let width = opts.width || (hasOrient ? (isLandscape ? 1260 : 810) : 1100);
    let height = opts.height || 0;
    const minOrientedHeight = hasOrient ? (isLandscape ? 890 : 1146) : 360;

    if (typeof elementOrHtml === 'string') {
      htmlStr = elementOrHtml;
    } else if (elementOrHtml && elementOrHtml.outerHTML) {
      htmlStr = elementOrHtml.outerHTML;
      const rect = elementOrHtml.getBoundingClientRect();
      if (rect.width > 200) width = Math.ceil(rect.width) + 40;
      if (rect.height > 100) height = Math.ceil(rect.height) + 40;
    }

    // Measure actual height in an offscreen container if not known
    const probe = document.createElement('div');
    probe.style.position = 'fixed';
    probe.style.left = '-99999px';
    probe.style.top = '0';
    probe.style.width = width + 'px';
    probe.style.padding = '24px';
    probe.style.background = '#ffffff';
    probe.style.color = '#0f172a';
    probe.style.fontFamily = "'Segoe UI', Tahoma, Arial, sans-serif";
    probe.dir = opts.dir || 'rtl';
    probe.innerHTML = `
      <style>
        .shams-img-wrap { background:#ffffff; color:#0f172a; font-family:'Segoe UI',Tahoma,Arial,sans-serif; padding:16px; box-sizing:border-box; max-width:100%; overflow:hidden; }
        .shams-img-wrap table { width:100%; max-width:100%; table-layout:fixed; border-collapse:collapse; margin-bottom:10px; box-sizing:border-box; }
        .shams-img-wrap th, .shams-img-wrap td { border:1.5px solid #0f172a; padding:6px 6px; font-size:12px; color:#0f172a; line-height:1.35; word-break:break-word; overflow-wrap:anywhere; white-space:normal; box-sizing:border-box; }
        .shams-img-wrap th { background:#e2e8f0; font-weight:800; }
        .shams-img-wrap .sheet-header-table, .shams-img-wrap .sheet-header-table td { border:none !important; background:transparent !important; }
        .shams-img-wrap .sheet-header-table { border-bottom:2.5px solid #0f172a !important; margin-bottom:12px !important; }
        .shams-img-wrap .print-crew-wrap { margin:0 0 10px 0; }
        .shams-img-wrap .print-crew-table { width:100% !important; table-layout:fixed !important; border-collapse:collapse !important; margin-bottom:4px !important; }
        .shams-img-wrap .print-crew-table td { border:1.2px solid #94a3b8 !important; background:#f8fafc !important; text-align:center !important; padding:6px 8px !important; vertical-align:middle !important; }
        .shams-img-wrap .print-plot-img { display:block; width:100%; max-width:100%; margin:0 auto 10px auto; object-fit:contain; border:1.5px solid #334155; border-radius:6px; background:transparent; }
        .shams-img-wrap .print-plot-img.print-plot-img-full { width:100%; height:${isLandscape ? '670px' : '920px'}; max-height:${isLandscape ? '680px' : '930px'}; margin:2px auto 0 auto; object-fit:fill; }
        .shams-img-wrap .dmx-split-table { width:100%; max-width:100%; table-layout:fixed !important; border-collapse:separate !important; border-spacing:6px 0 !important; border:none !important; }
        .shams-img-wrap .dmx-split-col { width:50%; max-width:50%; vertical-align:top; padding:5px !important; border:2px solid #0f172a !important; background:#ffffff !important; overflow:hidden; }
        .shams-img-wrap .dmx-inner-table th, .shams-img-wrap .dmx-inner-table td { line-height:1.34; }
      </style>
      <div class="shams-img-wrap">${htmlStr}</div>
    `;
    document.body.appendChild(probe);

    // Inline any local <img> sources (e.g. ./FB_IMG_...) as data URLs so SVG <foreignObject> renders them in PNG/JPG exports
    const probeImgs = Array.from(probe.querySelectorAll('img'));
    await Promise.all(
      probeImgs.map((im) => {
        const src = im.getAttribute('src') || '';
        if (!src || src.startsWith('data:')) return Promise.resolve();
        return new Promise((res) => {
          const loader = new Image();
          loader.crossOrigin = 'anonymous';
          loader.onload = () => {
            try {
              const c = document.createElement('canvas');
              c.width = loader.naturalWidth || 128;
              c.height = loader.naturalHeight || 128;
              c.getContext('2d').drawImage(loader, 0, 0);
              im.setAttribute('src', c.toDataURL('image/png'));
            } catch (e) {}
            res();
          };
          loader.onerror = () => res();
          loader.src = src;
        });
      })
    );

    const measuredH = Math.max(height, Math.ceil(probe.scrollHeight) + 32, minOrientedHeight);
    const xhtml = new XMLSerializer().serializeToString(probe.querySelector('.shams-img-wrap'));
    probe.remove();

    const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${measuredH}">
      <rect width="100%" height="100%" fill="#ffffff"/>
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml" dir="${opts.dir || 'rtl'}" style="font-family:'Segoe UI',Tahoma,Arial,sans-serif;background:#ffffff;color:#0f172a;padding:16px;">
          <style>
            * { box-sizing: border-box; }
            table { width:100%; max-width:100%; table-layout:fixed; border-collapse:collapse; margin-bottom:10px; }
            th, td { border:1.5px solid #0f172a; padding:6px 6px; font-size:12px; color:#0f172a; line-height:1.35; word-break:break-word; overflow-wrap:anywhere; white-space:normal; }
            th { background:#e2e8f0; font-weight:800; }
            .sheet-header-table, .sheet-header-table td { border:none !important; background:transparent !important; }
            .sheet-header-table { border-bottom:2.5px solid #0f172a !important; margin-bottom:12px !important; }
            .dmx-split-table { width:100%; max-width:100%; table-layout:fixed !important; border-collapse:separate !important; border-spacing:6px 0 !important; border:none !important; }
            .dmx-split-col { width:50%; max-width:50%; vertical-align:top; padding:5px !important; border:2px solid #0f172a !important; background:#ffffff !important; overflow:hidden; }
            .dmx-inner-table th, .dmx-inner-table td { line-height:1.34; }
          </style>
          ${xhtml}
        </div>
      </foreignObject>
    </svg>`;

    const svgDataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const scale = 2;
        const canvas = document.createElement('canvas');
        canvas.width = width * scale;
        canvas.height = measuredH * scale;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        const outUrl = canvas.toDataURL(mime, 0.95);
        triggerDownloadDataURL(outUrl, filename);
        resolve(outUrl);
      };
      img.onerror = () => {
        if (global.CineApp && global.CineApp.showToast) {
          global.CineApp.showToast('⚠️ تعذر تصدير الصورة - جرب الطباعة المباشرة');
        }
        resolve(null);
      };
      img.src = svgDataUrl;
    });
  }

  /**
   * Export Excel (.xls HTML Workbook with UTF-8 BOM + optional .csv)
   */
  function exportExcel(htmlTableOrContent, filename = 'ShamsElber_Sheet.xls', opts = {}) {
    const isLandscape = opts && opts.orientation === 'landscape';
    const xlsOrient = isLandscape ? 'Landscape' : 'Portrait';
    const cssOrient = isLandscape ? 'landscape' : 'portrait';
    const fullHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40" dir="rtl">
      <head><meta charset="UTF-8">
      <!--[if gte mso 9]><xml>
        <x:ExcelWorkbook>
          <x:ExcelWorksheets>
            <x:ExcelWorksheet>
              <x:Name>Sheet1</x:Name>
              <x:WorksheetOptions>
                <x:PageSetup>
                  <x:Layout x:Orientation="${xlsOrient}"/>
                </x:PageSetup>
                <x:Print>
                  <x:ValidPrinterInfo/>
                  <x:PaperSizeIndex>9</x:PaperSizeIndex>
                </x:Print>
              </x:WorksheetOptions>
            </x:ExcelWorksheet>
          </x:ExcelWorksheets>
        </x:ExcelWorkbook>
      </xml><![endif]-->
      <style>
        @page { size: A4 ${cssOrient}; margin: 1cm; }
        table { border-collapse: collapse; width: 100%; font-family: Tahoma, Arial, sans-serif; }
        th, td { border: 1px solid #1e293b; padding: 6px 10px; text-align: right; font-size: 10pt; }
        th { background-color: #0f172a; color: #f59e0b; font-weight: bold; }
      </style>
      </head><body>${htmlTableOrContent}</body></html>`;
    const blob = new Blob(['\uFEFF' + fullHtml], { type: 'application/vnd.ms-excel;charset=utf-8' });
    triggerDownloadBlob(blob, filename.endsWith('.xls') || filename.endsWith('.xlsx') ? filename : filename + '.xls');
  }

  function exportCSV(rows, filename = 'ShamsElber_Sheet.csv') {
    const csvContent = (rows || [])
      .map((r) => r.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' });
    triggerDownloadBlob(blob, filename.endsWith('.csv') ? filename : filename + '.csv');
  }

  /**
   * Export Word (.doc MSO HTML Document matching the exact Print layout, borders, header & split tables)
   */
  function exportWord(htmlContent, filename = 'ShamsElber_Sheet.doc', title = 'ShamsElber light. DMX', opts = {}) {
    const isLandscape = opts && opts.orientation === 'landscape';
    const cssOrient = isLandscape ? 'landscape' : 'portrait';
    const pageSizeCm = isLandscape ? '29.7cm 21.0cm' : '21.0cm 29.7cm';
    const wordDoc = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40" dir="rtl">
      <head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
      <!--[if gte mso 9]>
      <xml>
        <w:WordDocument>
          <w:View>Print</w:View>
          <w:Zoom>100</w:Zoom>
          <w:DoNotOptimizeForBrowser/>
        </w:WordDocument>
      </xml>
      <![endif]-->
      <style>
        @page { size: A4 ${cssOrient}; margin: 1.2cm; }
        @page Section1 { size: ${pageSizeCm}; mso-page-orientation: ${cssOrient}; margin: 1.2cm 1.2cm 1.2cm 1.2cm; }
        div.WordSection1 { page: Section1; }
        body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; color: #0f172a; background: #ffffff; direction: rtl; margin: 0; padding: 0; }
        h1, h2, h3, h4 { color: #0f172a; margin: 6pt 0; font-family: 'Segoe UI', Tahoma, Arial, sans-serif; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 12pt; }
        th, td { border: 1.2pt solid #0f172a; padding: 6pt 8pt; font-size: 10pt; text-align: right; color: #0f172a; vertical-align: middle; }
        th { background-color: #e2e8f0; color: #0f172a; font-weight: bold; }
        tr:nth-child(even) td { background-color: #f8fafc; }
        .sheet-header-table, .sheet-header-table td { border: none !important; background: transparent !important; }
        .sheet-header-table { border-bottom: 2.2pt solid #0f172a !important; margin-bottom: 12pt; }
        .print-crew-wrap { margin: 0 0 10pt 0; }
        .print-crew-table { width: 100%; border-collapse: collapse; margin-bottom: 4pt; }
        .print-crew-table td { border: 1pt solid #94a3b8; background-color: #f8fafc !important; text-align: center; padding: 5pt 7pt; vertical-align: middle; }
        .print-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2pt solid #0f172a; padding-bottom: 8pt; margin-bottom: 12pt; }
        .print-plot-img { max-width: 100%; height: auto; border: 1pt solid #94a3b8; margin-bottom: 12pt; display: block; }
        .print-plot-img.print-plot-img-full { width: 100%; height: ${isLandscape ? '13.5cm' : '21.0cm'}; margin-bottom: 0; }
        .dmx-split-table { width: 100%; border-collapse: separate; border-spacing: 6pt 0; border: none; margin-bottom: 12pt; }
        .dmx-split-col { vertical-align: top; padding: 5pt; border: 1.5pt solid #0f172a; background: #ffffff !important; }
        .dmx-inner-table th, .dmx-inner-table td { line-height: 1.38; }
        .dmx-universe-block { margin-bottom: 4pt; }
      </style>
      </head><body><div class="WordSection1">${htmlContent}</div></body></html>`;
    const blob = new Blob(['\uFEFF' + wordDoc], { type: 'application/msword;charset=utf-8' });
    triggerDownloadBlob(blob, filename.endsWith('.doc') || filename.endsWith('.docx') ? filename : filename + '.doc');
  }

  function triggerDownloadDataURL(dataUrl, filename) {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function triggerDownloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  global.ShamsExport = {
    isValuePopulated,
    filterEmptyColumns,
    buildSheetHeaderHTML,
    print,
    exportImage,
    exportExcel,
    exportCSV,
    exportWord,
    triggerDownloadDataURL,
    triggerDownloadBlob
  };
})(window);
