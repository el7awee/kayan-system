function exportToExcel(data, headers, filename) {
    if (!data || !data.length) { Swal.fire({ icon: 'warning', title: 'لا توجد بيانات للتصدير' }); return; }
    const rows = data.map(row => {
        if (Array.isArray(row)) return row;
        return headers.map((_, i) => {
            const keys = Object.keys(row);
            const val = i < keys.length ? row[keys[i]] : '';
            return val !== undefined && val !== null ? String(val) : '';
        });
    });
    if (typeof XLSX !== 'undefined') {
        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
        XLSX.writeFile(wb, `${filename}.xlsx`);
    } else {
        const BOM = '\uFEFF';
        let csv = BOM + headers.join(',') + '\n';
        rows.forEach(r => {
            csv += r.map(v => `"${(v||'').replace(/"/g,'""')}"`).join(',') + '\n';
        });
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${filename}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
    }
}
