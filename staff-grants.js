(function () {
  const staff = document.querySelector('#staff-content');
  if (!staff) return;
  const grant = document.createElement('section');
  grant.style.cssText = 'margin-top:28px;padding:22px;border-radius:18px;background:#173451;color:#fff';
  grant.innerHTML = '<h2 style="margin:0;font-size:20px">Give someone free DoctorAI Pro for 1 month</h2><p style="color:#cfe9f2;font-size:12px;line-height:1.55">Enter an email to create a secure 30-day access code. Send the code or link privately.</p><form style="display:flex;gap:10px;flex-wrap:wrap"><input type="email" required placeholder="person@example.com" style="flex:1 1 230px;min-height:42px;padding:0 12px;border:0;border-radius:9px"><button style="min-height:42px;padding:0 15px;border:0;border-radius:9px;background:#8ee9f4;color:#173451;font-weight:800">Create 30-day code</button></form><div style="margin-top:12px;color:#bff4ff;font-size:12px;line-height:1.5;word-break:break-word"></div>';
  staff.insertBefore(grant, staff.firstElementChild);
  const stats = document.createElement('section');
  stats.style.cssText = 'margin-top:14px;padding:18px;border:1px solid #cde5f0;border-radius:16px;background:#f8fdff;color:#173451';
  stats.innerHTML = '<b>Free Pro users</b><div style="margin-top:8px;font-size:28px;font-weight:800">Loading…</div><small style="color:#6a8493">Active users who redeemed a current DoctorAI Pro code</small><div style="margin-top:12px;font-size:12px;color:#587487"></div>';
  staff.insertBefore(stats, staff.children[1]);
  const loadStats = async () => {
    const value = stats.querySelector('div'); const details = stats.querySelector('div:last-child');
    value.textContent = 'Loading…'; details.textContent = '';
    try {
      const response = await fetch('/api/staff/access?stats=1&audit=1'); const body = await response.json(); const data = body.stats || {};
      if (!response.ok || !data.configured) { value.textContent = 'Not connected'; details.textContent = data.error || body.reason || 'Stats unavailable.'; return; }
      value.textContent = String(data.active || 0);
      const children = (data.users || []).map(user => {
        const row = document.createElement('div'); row.style.cssText = 'display:flex;align-items:center;gap:8px;justify-content:space-between;padding:7px 0;border-top:1px solid #e3eef3';
        const copy = document.createElement('span'); copy.textContent = `${user.email} · expires ${new Date(user.expiresAt).toLocaleDateString()}`;
        const revoke = document.createElement('button'); revoke.type = 'button'; revoke.dataset.revokePro = user.email; revoke.textContent = 'Revoke'; revoke.style.cssText = 'border:1px solid #efc3bf;border-radius:7px;background:#fff7f5;color:#a34e48;padding:5px 8px;font:inherit;font-size:11px;font-weight:700';
        row.append(copy, revoke); return row;
      });
      if (!data.users?.length) { const empty = document.createElement('span'); empty.textContent = 'No active complimentary Pro users yet.'; children.push(empty); }
      const history = [...(data.history || []), ...(body.audit?.entries || [])].slice(0, 16);
      if (history.length) {
        const disclosure = document.createElement('details'); disclosure.style.cssText = 'margin-top:12px;border-top:1px solid #e3eef3;padding-top:10px';
        const summary = document.createElement('summary'); summary.textContent = 'Grant and redemption history'; summary.style.cssText = 'cursor:pointer;font-weight:800;color:#173451';
        const log = document.createElement('div'); log.style.cssText = 'margin-top:7px;display:grid;gap:5px;color:#587487';
        history.forEach(item => { const row = document.createElement('div'); const activity = item.type || (item.revokedAt ? 'revoked' : item.redeemedAt ? 'redeemed' : 'issued'); const at = item.at || item.revokedAt || item.redeemedAt || item.issuedAt; row.textContent = `${item.email || item.accountEmail || 'Account'} · ${activity}${at ? ` · ${new Date(at).toLocaleString()}` : ''}`; log.append(row); });
        disclosure.append(summary, log); children.push(disclosure);
      }
      details.replaceChildren(...children);
    } catch { value.textContent = 'Not connected'; details.textContent = 'Stats could not be loaded.'; }
  };
  loadStats();
  stats.addEventListener('click', async event => {
    const button = event.target.closest('[data-revoke-pro]'); if (!button) return;
    const email = button.dataset.revokePro; if (!email || !window.confirm(`Revoke complimentary Pro for ${email}?`)) return;
    button.disabled = true; button.textContent = 'Revoking…';
    try { const response = await fetch('/api/staff/revoke-pro', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Could not revoke access.'); await loadStats(); }
    catch (error) { button.disabled = false; button.textContent = error instanceof Error ? error.message : 'Could not revoke'; }
  });
  const form = grant.querySelector('form'); const input = grant.querySelector('input'); const result = grant.querySelector('div');
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); result.textContent = 'Creating secure access link…';
    try {
      const response = await fetch('/api/staff/grant-pro', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: input.value }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Could not create link.');
      result.innerHTML = body.emailed ? `Email sent automatically to <b>${body.email}</b> from support@doctoraiworld.com.` : `30-day access code for <b>${body.email}</b>:<br><code style="display:block;margin-top:7px;color:#fff">${body.accessCode}</code><br><a href="${body.redeemUrl}" style="color:#fff">Or send the activation link</a>`;
      await loadStats();
    } catch (error) { result.textContent = error instanceof Error ? error.message : 'Could not create link.'; }
  });
})();
