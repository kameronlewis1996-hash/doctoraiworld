(function () {
  const staff = document.querySelector('#staff-content');
  if (!staff) return;

  const panel = document.createElement('section');
  panel.style.cssText = 'margin-top:14px;padding:22px;border:1px solid #e8c8c4;border-radius:18px;background:#fff9f8;color:#173451';
  panel.innerHTML = '<h2 style="margin:0;font-size:20px">Account deletion requests</h2><p style="color:#587487;font-size:12px;line-height:1.6">Use only after verifying the account owner through the approved deletion request process. The process, retention rules, support coverage, and billing procedure must be documented before this control is enabled.</p><form><label style="display:block;font-size:12px;font-weight:700">Account email<input type="email" required autocomplete="off" style="display:block;width:100%;min-height:42px;margin:7px 0 10px;padding:0 12px;border:1px solid #bdd2dc;border-radius:9px"></label><button type="button" data-inspect style="min-height:40px;padding:0 14px;border:1px solid #bdd2dc;border-radius:9px;background:#fff;color:#173451;font-weight:800">Inspect account and billing</button><div data-result role="status" aria-live="polite" style="margin-top:12px;font-size:12px;line-height:1.6;white-space:pre-wrap"></div><div data-confirm-area hidden style="margin-top:12px;padding-top:12px;border-top:1px solid #edd9d6"><label style="display:block;margin:8px 0;font-size:12px"><input type="checkbox" data-verified> I verified the account owner through the approved deletion request process.</label><label style="display:block;margin:8px 0;font-size:12px"><input type="checkbox" data-retention> I reviewed and handled records that must be retained under applicable law or provider terms.</label><label style="display:block;margin:8px 0;font-size:12px"><input type="checkbox" data-billing> I reviewed the billing results above and confirmed no subscription needs resolution.</label><label style="display:block;margin:10px 0;font-size:12px;font-weight:700">Type DELETE followed by the exact account email<input type="text" data-confirm autocomplete="off" style="display:block;width:100%;min-height:42px;margin-top:7px;padding:0 12px;border:1px solid #d9bbb7;border-radius:9px"></label><button type="button" data-delete disabled style="min-height:42px;padding:0 16px;border:0;border-radius:9px;background:#9d453e;color:#fff;font-weight:800;opacity:.55">Delete account data</button></div>';
  staff.insertBefore(panel, staff.firstElementChild);
  panel.querySelector('[data-billing]').parentElement.lastChild.textContent = ' I independently reviewed Stripe for recently created subscriptions, changed billing emails, and legacy Checkout links, and resolved anything that needs action.';

  const input = panel.querySelector('input[type="email"]');
  const inspectButton = panel.querySelector('[data-inspect]');
  const deleteButton = panel.querySelector('[data-delete]');
  const result = panel.querySelector('[data-result]');
  const confirmArea = panel.querySelector('[data-confirm-area]');
  const confirmation = panel.querySelector('[data-confirm]');
  let inspectedEmail = '';
  let workflowEnabled = false;

  const checked = () => ['[data-verified]', '[data-retention]', '[data-billing]'].every(selector => panel.querySelector(selector).checked);
  const updateDeleteButton = () => {
    const enabled = workflowEnabled && inspectedEmail === input.value.trim().toLowerCase() && checked() && confirmation.value === `DELETE ${inspectedEmail}`;
    deleteButton.disabled = !enabled;
    deleteButton.style.opacity = enabled ? '1' : '.55';
  };
  const post = async body => {
    const response = await fetch('/api/staff/delete-account', {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body)
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'The account action could not be completed.');
    return payload;
  };

  inspectButton.addEventListener('click', async () => {
    const email = input.value.trim().toLowerCase();
    if (!email) { result.textContent = 'Enter the account email first.'; return; }
    inspectButton.disabled = true;
    inspectButton.textContent = 'Checking account and Stripe…';
    result.textContent = '';
    confirmArea.hidden = true;
    inspectedEmail = '';
    workflowEnabled = false;
    try {
      const body = await post({ action: 'inspect', email });
      const lines = [
        `Deletion workflow enabled: ${body.workflowEnabled ? 'yes' : 'no'}`,
        `Account deletion state: ${body.deletionStatus || 'not started'}`,
        `Matching Stripe customers: ${body.billing.customers}`,
        `Subscriptions checked: ${body.billing.subscriptions.length}`,
        'Metadata search is supplemental and can lag. Check recent and legacy billing records directly in Stripe before approving deletion.',
        `Open checkout sessions tracked: ${body.billing.openCheckoutSessions || 0} (open tracked links expire during deletion)`,
        ...body.billing.subscriptions.map(item => `• ${item.status}${item.cancelAtPeriodEnd ? ' (cancellation scheduled)' : ''}`),
        ...(body.billing.blockers || []).map(item => `Blocker: ${item}`)
      ];
      if (!body.billing.verified) lines.push('Billing could not be verified; deletion is blocked.');
      if (!body.workflowEnabled) lines.push('The control stays disabled until the owner approves and documents the identity verification, billing, retention, and support procedures, then enables ACCOUNT_DELETION_WORKFLOW_ENABLED.');
      result.textContent = lines.join('\n');
      inspectedEmail = email;
      workflowEnabled = Boolean(body.workflowEnabled && body.billing.verified && !body.billing.blockers.length);
      confirmArea.hidden = !body.workflowEnabled;
      updateDeleteButton();
    } catch (error) {
      result.textContent = error instanceof Error ? error.message : 'The account could not be inspected.';
    } finally {
      inspectButton.disabled = false;
      inspectButton.textContent = 'Inspect account and billing';
    }
  });

  panel.addEventListener('input', updateDeleteButton);
  panel.addEventListener('change', updateDeleteButton);
  deleteButton.addEventListener('click', async () => {
    const email = inspectedEmail;
    if (!email || !window.confirm(`Permanently delete DoctorAI account data for ${email}? This cannot be undone.`)) return;
    deleteButton.disabled = true;
    deleteButton.textContent = 'Deleting account data…';
    result.textContent = 'Blocking account access, expiring tracked open checkout links, and removing sessions, health data, documents, grants, audit entries, and eligible Stripe event references…';
    try {
      const body = await post({
        action: 'delete', email,
        requestVerified: panel.querySelector('[data-verified]').checked,
        retentionReviewed: panel.querySelector('[data-retention]').checked,
        billingReviewed: panel.querySelector('[data-billing]').checked,
        confirmation: confirmation.value
      });
      result.textContent = `Account data deleted. Private documents removed: ${body.documentsDeleted}. The account remains blocked from reactivation.`;
      confirmArea.hidden = true;
      inspectedEmail = '';
      workflowEnabled = false;
      input.value = '';
      confirmation.value = '';
      panel.querySelectorAll('[data-verified], [data-retention], [data-billing]').forEach(box => { box.checked = false; });
    } catch (error) {
      result.textContent = error instanceof Error ? error.message : 'Account deletion did not finish. Inspect and retry after resolving any blocker.';
    } finally {
      deleteButton.textContent = 'Delete account data';
      updateDeleteButton();
    }
  });
})();
