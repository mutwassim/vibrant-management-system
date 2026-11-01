"use client";
import React, { useState } from 'react';
import { parseImportFile, downloadImportTemplate } from '../lib/importUtils';

/**
 * Bulk import of past students / expenses from an Excel or CSV file.
 * Styling relies on the .modal / .btn / .form-group classes that both
 * dashboard.css and super-admin.css already define, so it picks up each
 * page's own theme.
 *
 * Props:
 *   open        boolean
 *   onClose     () => void
 *   getHeaders  () => fetch headers incl. auth token
 *   onToast     (msg, color) => void
 *   onImported  () => void            called after a successful import
 *   tenantId    string | undefined    required only for SUPER_ADMIN
 *   tenantName  string | undefined    shown in the title
 */
export default function ImportModal({ open, onClose, getHeaders, onToast, onImported, tenantId, tenantName }) {
  const [fileName, setFileName] = useState('');
  const [forcedType, setForcedType] = useState('auto');
  const [parsed, setParsed] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  if (!open) return null;

  const toast = (msg, color) => {
    if (onToast) onToast(msg, color);
  };

  const reset = () => {
    setFileName('');
    setForcedType('auto');
    setParsed(null);
    setParsing(false);
    setImporting(false);
    setResult(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const handleFile = async (file, type) => {
    if (!file) return;
    setParsing(true);
    setResult(null);
    try {
      const data = await parseImportFile(file, type);
      setParsed({ ...data, file });
      if (data.errors.length && !data.students.length && !data.expenses.length) {
        toast('Could not read any rows from this file', '#ef4444');
      }
    } catch (err) {
      setParsed(null);
      toast('Failed to read file: ' + err.message, '#ef4444');
    } finally {
      setParsing(false);
    }
  };

  const onFileChange = (e) => {
    const file = e.target.files && e.target.files[0];
    setFileName(file ? file.name : '');
    handleFile(file, forcedType);
  };

  const onTypeChange = (e) => {
    const type = e.target.value;
    setForcedType(type);
    if (parsed && parsed.file) handleFile(parsed.file, type);
  };

  const handleTemplate = async () => {
    try {
      await downloadImportTemplate();
    } catch (err) {
      toast('Could not build template: ' + err.message, '#ef4444');
    }
  };

  const runImport = async () => {
    if (!parsed) return;
    setImporting(true);
    try {
      const payload = {
        students: parsed.students,
        expenses: parsed.expenses,
        stock: parsed.stock,
        stockTransactions: parsed.stockTransactions,
        bookings: parsed.bookings
      };
      if (tenantId) payload.tenantId = tenantId;

      const res = await fetch('/api/import', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        setResult(data);
        toast('Import complete!', '#00a876');
        if (onImported) onImported();
      } else {
        toast(data.error || 'Import failed', '#ef4444');
      }
    } catch (err) {
      toast('Server communication error', '#ef4444');
    } finally {
      setImporting(false);
    }
  };

  const totalRows = parsed ? parsed.students.length + parsed.expenses.length + parsed.stock.length + parsed.stockTransactions.length + parsed.bookings.length : 0;
  const muted = { fontSize: '12px', opacity: 0.75 };
  const box = {
    border: '1px solid rgba(128,128,128,0.35)',
    borderRadius: '8px',
    padding: '10px 12px',
    marginBottom: '12px',
    fontSize: '13px'
  };

  return (
    <div className="modal-overlay" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '760px' }}>
        <h3>
          Import Previous Data
          {tenantName ? <span style={{ opacity: 0.7 }}> — {tenantName}</span> : null}
        </h3>

        {!result && (
          <>
            <div style={{ ...box, ...muted }}>
              Upload an Excel (.xlsx / .xls) or CSV file of past <strong>students</strong>, <strong>expenses</strong>,{' '}
              <strong>stock</strong>, <strong>stock transactions</strong> and <strong>ground bookings</strong>. One row
              per student per month. Existing records are matched and updated where possible, so re-importing the same
              file (e.g. a backup) is safe. Numeric dates are read as DD/MM/YYYY.
            </div>

            <div className="form-group" style={{ marginBottom: '10px' }}>
              <label>Excel / CSV File</label>
              <input type="file" accept=".xlsx,.xls,.csv" onChange={onFileChange} />
              {fileName ? <div style={{ ...muted, marginTop: '5px' }}>{fileName}</div> : null}
            </div>

            <div className="form-group" style={{ marginBottom: '10px' }}>
              <label>Sheet Type</label>
              <select value={forcedType} onChange={onTypeChange}>
                <option value="auto">Auto-detect (recommended)</option>
                <option value="students">Students</option>
                <option value="expenses">Expenses</option>
                <option value="stock">Stock</option>
                <option value="stockTransactions">Stock Transactions</option>
                <option value="bookings">Bookings</option>
              </select>
              <div style={{ ...muted, marginTop: '5px' }}>
                Only needed for a CSV whose columns aren&apos;t recognised.
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={handleTemplate}>
                ⬇ Download Template
              </button>
            </div>

            {parsing && <div style={muted}>Reading file…</div>}

            {parsed && !parsing && (
              <div style={box}>
                <div style={{ fontWeight: 700, marginBottom: '6px' }}>
                  Preview — {parsed.students.length} student, {parsed.expenses.length} expense, {parsed.stock.length} stock, {parsed.stockTransactions.length} stock transaction, {parsed.bookings.length} booking row(s)
                </div>

                {parsed.sheets.map((s) => (
                  <div key={s.name} style={muted}>
                    Sheet &quot;{s.name}&quot; → {s.type} ({s.rows} rows)
                  </div>
                ))}

                {parsed.students.length > 0 && (
                  <div className="table-wrap" style={{ marginTop: '10px', maxHeight: '180px', overflow: 'auto' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Month</th>
                          <th>Fee</th>
                          <th>Status</th>
                          <th>Fee Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsed.students.slice(0, 5).map((s, i) => (
                          <tr key={i}>
                            <td>{s.name}</td>
                            <td>{s.month}</td>
                            <td>{s.fee}</td>
                            <td>{s.status}</td>
                            <td>{s.feeDate}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {parsed.students.length > 5 && (
                      <div style={{ ...muted, padding: '6px' }}>+ {parsed.students.length - 5} more…</div>
                    )}
                  </div>
                )}

                {parsed.expenses.length > 0 && (
                  <div className="table-wrap" style={{ marginTop: '10px', maxHeight: '180px', overflow: 'auto' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Title</th>
                          <th>Month</th>
                          <th>Amount</th>
                          <th>Category</th>
                          <th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsed.expenses.slice(0, 5).map((e, i) => (
                          <tr key={i}>
                            <td>{e.title}</td>
                            <td>{e.month}</td>
                            <td>{e.amount}</td>
                            <td>{e.category}</td>
                            <td>{e.date}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {parsed.expenses.length > 5 && (
                      <div style={{ ...muted, padding: '6px' }}>+ {parsed.expenses.length - 5} more…</div>
                    )}
                  </div>
                )}

                {parsed.stock.length > 0 && (
                  <div className="table-wrap" style={{ marginTop: '10px', maxHeight: '180px', overflow: 'auto' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Category</th>
                          <th>Qty</th>
                          <th>Unit Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsed.stock.slice(0, 5).map((s, i) => (
                          <tr key={i}>
                            <td>{s.item}</td>
                            <td>{s.category}</td>
                            <td>{s.qty}</td>
                            <td>{s.unitCost}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {parsed.stock.length > 5 && (
                      <div style={{ ...muted, padding: '6px' }}>+ {parsed.stock.length - 5} more…</div>
                    )}
                  </div>
                )}

                {parsed.stockTransactions.length > 0 && (
                  <div className="table-wrap" style={{ marginTop: '10px', maxHeight: '180px', overflow: 'auto' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Type</th>
                          <th>Qty</th>
                          <th>Amount</th>
                          <th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsed.stockTransactions.slice(0, 5).map((t, i) => (
                          <tr key={i}>
                            <td>{t.item}</td>
                            <td>{t.type}</td>
                            <td>{t.qty}</td>
                            <td>{t.amount}</td>
                            <td>{t.date}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {parsed.stockTransactions.length > 5 && (
                      <div style={{ ...muted, padding: '6px' }}>+ {parsed.stockTransactions.length - 5} more…</div>
                    )}
                  </div>
                )}

                {parsed.bookings.length > 0 && (
                  <div className="table-wrap" style={{ marginTop: '10px', maxHeight: '180px', overflow: 'auto' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Team / Client</th>
                          <th>Ground</th>
                          <th>Date</th>
                          <th>Amount</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsed.bookings.slice(0, 5).map((b, i) => (
                          <tr key={i}>
                            <td>{b.teamName}</td>
                            <td>{b.ground}</td>
                            <td>{b.date}</td>
                            <td>{b.amount}</td>
                            <td>{b.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {parsed.bookings.length > 5 && (
                      <div style={{ ...muted, padding: '6px' }}>+ {parsed.bookings.length - 5} more…</div>
                    )}
                  </div>
                )}

                {parsed.errors.length > 0 && (
                  <div style={{ marginTop: '10px', color: '#ef4444', fontSize: '12px' }}>
                    <div style={{ fontWeight: 700, marginBottom: '4px' }}>Skipped rows ({parsed.errors.length}):</div>
                    <div style={{ maxHeight: '90px', overflow: 'auto' }}>
                      {parsed.errors.slice(0, 10).map((err, i) => (
                        <div key={i}>• {err}</div>
                      ))}
                      {parsed.errors.length > 10 && <div>• + {parsed.errors.length - 10} more…</div>}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {result && (
          <div style={box}>
            <div style={{ fontWeight: 700, marginBottom: '6px', color: '#00a876' }}>Import complete ✅</div>
            <div>Students created: {result.studentsCreated}</div>
            <div>Students updated: {result.studentsUpdated}</div>
            <div>Payment entries added: {result.paymentsAdded}</div>
            <div>Payment entries updated: {result.paymentsUpdated}</div>
            <div>Expenses created: {result.expensesCreated}</div>
            <div>Expenses updated: {result.expensesUpdated}</div>
            {(result.stockCreated > 0 || result.stockUpdated > 0) && (
              <>
                <div>Stock items created: {result.stockCreated}</div>
                <div>Stock items updated: {result.stockUpdated}</div>
              </>
            )}
            {(result.stockTransactionsCreated > 0 || result.stockTransactionsSkipped > 0) && (
              <>
                <div>Stock transactions added: {result.stockTransactionsCreated}</div>
                <div>Stock transactions already present (skipped): {result.stockTransactionsSkipped}</div>
              </>
            )}
            {(result.bookingsCreated > 0 || result.bookingsUpdated > 0) && (
              <>
                <div>Bookings created: {result.bookingsCreated}</div>
                <div>Bookings updated: {result.bookingsUpdated}</div>
              </>
            )}
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={close}>
            {result ? 'Close' : 'Cancel'}
          </button>
          {!result && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={runImport}
              disabled={!parsed || parsing || importing || totalRows === 0}
            >
              {importing ? 'Importing…' : `Import ${totalRows} row(s)`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}