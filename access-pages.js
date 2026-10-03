"use strict";
(() => {
  const $ = (id) => document.getElementById(id),
    busy = new Set();
  const text = (id, value) => {
    if ($(id)) $(id).textContent = value;
  };
  const error = (id, value) => {
    text(id, value);
    $(id)?.focus();
  };
  const post = async (url, body) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      credentials: "same-origin",
    });
    const payload = await response.json();
    if (!response.ok)
      throw new Error(payload.error || "This action is unavailable.");
    return payload;
  };
  const get = async (url) => {
    const response = await fetch(url, {
      cache: "no-store",
      credentials: "same-origin",
    });
    const payload = await response.json();
    return { ok: response.ok, payload };
  };
  const operation = async (name, form, failure, fn) => {
    if (busy.has(name)) return;
    busy.add(name);
    const buttons = [...form.querySelectorAll("button")];
    buttons.forEach((b) => {
      b.disabled = true;
    });
    text(failure, "");
    try {
      await fn();
    } catch (e) {
      error(failure, e.message);
    } finally {
      busy.delete(name);
      buttons.forEach((b) => {
        b.disabled = false;
      });
    }
  };
  const addText = (root, tag, value) => {
    const el = document.createElement(tag);
    el.textContent = value;
    root.append(el);
    return el;
  };
  if (document.body.dataset.accessPage === "support") {
    let config;
    const load = async () => {
      const { ok, payload } = await get("/api/health/supported-access");
      config = payload;
      text(
        "support-status",
        payload.intakeOpen && ok
          ? "Applications are open within the funded allocation. Every request needs manual review."
          : payload.error ||
              "Applications are closed while eligibility, funding, private review and retention decisions are pending. Do not send proof.",
      );
      $("support-fields").disabled = !(
        ok &&
        payload.authenticated &&
        payload.intakeOpen
      );
      text(
        "application-result",
        payload.approvedLifetime
          ? "Your supported lifetime Pro grant is approved. Closing new intake does not remove this grant."
          : (payload.applications || [])
              .map(
                (a) => `Application status: ${a.status.replaceAll("_", " ")}`,
              )
              .join(". "),
      );
      if (ok && payload.reviewer) {
        $("support-review").hidden = false;
        const queue = await get("/api/staff/supported-access");
        if (!queue.ok) {
          text("review-status", queue.payload.error);
          return;
        }
        $("review-fields").disabled = !queue.payload.intakeOpen;
        $("review-queue").replaceChildren();
        $("review-application").replaceChildren();
        text(
          "review-status",
          `${queue.payload.report.complimentaryAccounts} approved complimentary accounts; ${queue.payload.report.reviewMinutes} recorded review minutes. Cash contribution totals are not configured.`,
        );
        (queue.payload.applications || []).forEach((a) => {
          const row = addText(
            $("review-queue"),
            "p",
            `${a.id} · ${a.status} · ${a.kind || "minimal completed decision"}${a.referralReference ? " · reference " + a.referralReference : ""}`,
          );
          row.className = "record";
          if (["pending", "more_information"].includes(a.status)) {
            const option = document.createElement("option");
            option.value = a.id;
            option.textContent = a.id;
            $("review-application").append(option);
          }
        });
        if (!$("review-application").options.length)
          $("review-fields").disabled = true;
      }
    };
    $("support-kind").addEventListener("change", () => {
      const family = $("support-kind").value === "eligible_family";
      $("family-authority-label").hidden = !family;
      $("support-form").elements.authorityConfirmed.required = family;
    });
    $("support-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      operation("application", form, "support-error", async () => {
        const body = {
          kind: form.elements.kind.value,
          eligibilityConfirmed: form.elements.eligibilityConfirmed.checked,
        };
        if (body.kind === "eligible_family")
          body.authorityConfirmed = form.elements.authorityConfirmed.checked;
        if (form.elements.referralReference.value)
          body.referralReference = form.elements.referralReference.value;
        await post("/api/health/supported-access", body);
        await load();
      });
    });
    $("review-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      operation("review", form, "review-error", async () => {
        await post("/api/staff/supported-access", {
          applicationId: form.elements.applicationId.value,
          outcome: form.elements.outcome.value,
          reviewReference: form.elements.reviewReference.value,
          reviewMinutes: Number(form.elements.reviewMinutes.value),
          verificationComplete: form.elements.verificationComplete.checked,
        });
        await load();
      });
    });
    load().catch(() =>
      text(
        "support-status",
        "Private application status is unavailable. Intake remains disabled; do not send proof.",
      ),
    );
  } else {
    let enabled = false,
      selected = null,
      records = null,
      invitationFragment = "",
      actorKey = "";
    const load = async () => {
      const { ok, payload } = await get("/api/health/care-access");
      enabled = ok && payload.enabled;
      actorKey = ok ? payload.accountKey || "" : "";
      $("invite-fields").disabled = !enabled;
      text(
        "care-status",
        enabled
          ? "Review the exact person, record groups and permissions before sharing. You can revoke future access."
          : payload.error ||
              "Caregiver invitations are disabled pending consent policy and signed-in verification.",
      );
      $("care-own-list").replaceChildren();
      const entries = [
        ...(payload.grants || []),
        ...(payload.invitations || []),
      ];
      if (!entries.length)
        addText(
          $("care-own-list"),
          "p",
          ok
            ? "No caregiver permission is recorded for this account."
            : "Your access list is unavailable.",
        );
      entries.forEach((e) => {
        const row = document.createElement("div");
        row.className = "record";
        addText(
          row,
          "p",
          `${e.recipientEmail} · ${e.role} · ${e.scopes.join(", ")} · ${e.revokedAt ? "revoked" : e.acceptedAt ? "accepted" : "invited"}`,
        );
        if (!e.revokedAt) {
          const b = addText(row, "button", "Revoke access");
          b.type = "button";
          b.addEventListener("click", () => {
            if (
              !confirm(
                "Revoke this permission? Previously exported copies cannot be erased.",
              )
            )
              return;
            operation("revoke-" + e.id, row, "invite-error", async () => {
              await post("/api/health/care-access", {
                action: "revoke",
                id: e.id,
              });
              await load();
            });
          });
        }
        $("care-own-list").append(row);
      });
      $("care-incoming").replaceChildren();
      if (!(payload.incoming || []).length)
        addText(
          $("care-incoming"),
          "p",
          "No active caregiver records have been loaded.",
        );
      (payload.incoming || []).forEach((ref) => {
        const b = addText(
          $("care-incoming"),
          "button",
          `${ref.role}: ${ref.scopes.join(", ")}`,
        );
        b.type = "button";
        b.disabled = !enabled;
        b.addEventListener("click", () => openShared(ref));
      });
    };
    const sharedUrl = (ref) =>
      "/api/health/shared-state?" +
      new URLSearchParams({ ownerKey: ref.ownerKey, grantId: ref.grantId });
    const clearShared = () => {
      selected = null;
      records = null;
      $("shared-content").replaceChildren();
      $("shared-notes").value = "";
      for (const scope of ["medications", "appointments"])
        $("shared-" + scope + "-edit").replaceChildren();
      $("shared-records").hidden = true;
    };
    const captureManualDraft = (scope) => {
      if (!records) return;
      document
        .querySelectorAll("#shared-" + scope + "-edit [data-entry-index]")
        .forEach((box) => {
          const index = Number(box.dataset.entryIndex);
          box.querySelectorAll("[data-field]").forEach((input) => {
            records.state[scope][index][input.dataset.field] = input.value;
          });
        });
    };
    const renderEditor = (scope) => {
      const form = $("shared-" + scope + "-form"),
        root = $("shared-" + scope + "-edit");
      root.replaceChildren();
      form.hidden = !(
        records?.role === "editor" && records.scopes.includes(scope)
      );
      if (form.hidden) return;
      const fields =
        scope === "medications"
          ? [
              ["name", "Medication name", "text"],
              ["dose", "Reviewed label strength", "text"],
              ["frequency", "Frequency from label", "text"],
              ["instructions", "Label instructions", "text"],
            ]
          : [
              ["title", "Appointment title", "text"],
              ["date", "Date", "date"],
              ["time", "Time (optional)", "time"],
              ["provider", "Provider (optional)", "text"],
              ["location", "Location (optional)", "text"],
              ["note", "Note (optional)", "text"],
            ];
      (records.state[scope] || []).forEach((item, index) => {
        const box = document.createElement("fieldset");
        addText(box, "legend", `Entry ${index + 1}`);
        box.dataset.entryIndex = String(index);
        for (const [name, title, type] of fields) {
          const label = document.createElement("label");
          addText(label, "span", title);
          const input = document.createElement("input");
          input.type = type;
          input.dataset.field = name;
          input.value = item[name] || "";
          input.maxLength = name === "name" ? 120 : name === "dose" ? 80 : 500;
          input.required =
            name === "name" || name === "title" || name === "date";
          label.append(input);
          box.append(label);
        }
        const remove = addText(box, "button", "Remove this recorded entry");
        remove.type = "button";
        remove.addEventListener("click", () => {
          if (
            !confirm(
              "Remove this recorded entry? This does not change treatment or cancel a real appointment.",
            )
          )
            return;
          captureManualDraft(scope);
          records.state[scope].splice(index, 1);
          renderEditor(scope);
        });
        root.append(box);
      });
    };
    const openShared = async (ref) => {
      try {
        const { ok, payload } = await get(sharedUrl(ref));
        if (!ok) throw new Error(payload.error);
        selected = ref;
        records = payload;
        $("shared-records").hidden = false;
        text(
          "shared-permission",
          `${payload.role} · ${payload.scopes.join(", ")} · session only; no persistent browser health copy. AI and label scanning are unavailable.`,
        );
        $("shared-content").replaceChildren();
        for (const scope of payload.scopes) {
          addText($("shared-content"), "h3", scope);
          if (scope === "notes") {
            addText(
              $("shared-content"),
              "p",
              payload.state.profile?.notes || "No health notes saved",
            );
            (payload.state.timeline || []).forEach((n) =>
              addText(
                $("shared-content"),
                "p",
                n.description || n.title || "Note",
              ),
            );
          } else
            (payload.state[scope] || []).forEach((r) => {
              const row = addText(
                $("shared-content"),
                "p",
                scope === "medications"
                  ? `${r.name} · ${r.dose || "strength not confirmed"} · ${r.frequency || "directions not confirmed"}`
                  : `${r.title} · ${r.date || ""} · ${r.time || ""}`,
              );
              row.className = "record";
            });
        }
        $("shared-notes-form").hidden = !(
          payload.role === "editor" && payload.scopes.includes("notes")
        );
        $("shared-notes").value = payload.state.profile?.notes || "";
        renderEditor("medications");
        renderEditor("appointments");
        $("shared-title").focus();
      } catch (e) {
        selected = null;
        records = null;
        $("shared-records").hidden = true;
        error("invite-error", e.message || "Shared records are unavailable.");
      }
    };
    document.querySelectorAll("[data-add-shared-entry]").forEach((button) =>
      button.addEventListener("click", () => {
        const scope = button.dataset.addSharedEntry;
        if (
          !records ||
          records.role !== "editor" ||
          !records.scopes.includes(scope)
        )
          return;
        captureManualDraft(scope);
        records.state[scope] ||= [];
        records.state[scope].push({});
        renderEditor(scope);
        $("shared-" + scope + "-edit")
          .lastElementChild?.querySelector("input")
          ?.focus();
      }),
    );
    for (const scope of ["medications", "appointments"])
      $("shared-" + scope + "-form").addEventListener("submit", (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        operation(scope, form, "shared-" + scope + "-error", async () => {
          if (!selected || !records) return;
          const value = [...form.querySelectorAll("[data-entry-index]")].map(
            (box) => {
              const old = records.state[scope][Number(box.dataset.entryIndex)],
                item = old.id ? { id: old.id } : {};
              box.querySelectorAll("[data-field]").forEach((input) => {
                item[input.dataset.field] = input.value;
              });
              return item;
            },
          );
          const response = await fetch(sharedUrl(selected), {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ revision: records.revision, scope, value }),
            cache: "no-store",
          });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error);
          await openShared(selected);
          text("shared-status", "Authorised " + scope + " saved.");
        });
      });
    $("shared-close").addEventListener("click", clearShared);
    $("shared-export").addEventListener("click", async () => {
      if (!selected) return;
      const { ok, payload } = await get(sharedUrl(selected));
      if (!ok) {
        error("shared-error", payload.error);
        return;
      }
      const blob = new Blob(
          [
            JSON.stringify(
              {
                exportedAt: new Date().toISOString(),
                scope: payload.scopes,
                state: payload.state,
              },
              null,
              2,
            ),
          ],
          { type: "application/json" },
        ),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = "doctorai-authorised-caregiver-records.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      text(
        "shared-status",
        "Authorised records exported. Keep the downloaded file private.",
      );
    });
    $("shared-notes-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      operation("notes", form, "shared-error", async () => {
        if (!selected || !records) return;
        const response = await fetch(sharedUrl(selected), {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            revision: records.revision,
            scope: "notes",
            value: form.elements.notes.value,
          }),
          cache: "no-store",
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error);
        await openShared(selected);
        text("shared-status", "Authorised notes saved.");
      });
    });
    $("invite-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      operation("invite", form, "invite-error", async () => {
        const scopes = [...form.querySelectorAll("[name=scope]:checked")].map(
          (e) => e.value,
        );
        if (!scopes.length)
          throw new Error("Select at least one record group.");
        const payload = await post("/api/health/care-access", {
          action: "invite",
          personId: "self",
          recipientEmail: form.elements.recipientEmail.value,
          role: form.elements.role.value,
          scopes,
          adultSelfConsent: form.elements.adultSelfConsent.checked,
        });
        $("invitation-result").replaceChildren();
        addText(
          $("invitation-result"),
          "span",
          "Share this one-use link privately with the named account. It expires in 48 hours. ",
        );
        const link = addText(
          $("invitation-result"),
          "a",
          "Open private invitation",
        );
        link.href =
          location.origin + "/care-access#invite=" + payload.invitationFragment;
        await load();
      });
    });
    $("accept-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      operation("accept", form, "accept-error", async () => {
        await post("/api/health/care-access", {
          action: "accept",
          invitationFragment,
          permissionAccepted: form.elements.permissionAccepted.checked,
        });
        invitationFragment = "";
        $("invitation-review").hidden = true;
        await load();
      });
    });
    const reviewInvitation = () => {
      if (!location.hash.startsWith("#invite=")) return;
      $("accept-form").reset();
      $("accept-button").disabled = true;
      invitationFragment = location.hash.slice(8);
      history.replaceState(null, "", location.pathname);
      $("invitation-review").hidden = false;
      post("/api/health/care-access", { action: "inspect", invitationFragment })
        .then((p) => {
          text(
            "invitation-permissions",
            `For this signed-in account: ${p.role}; ${p.scopes.join(", ")}. Expires ${new Date(p.expiresAt).toLocaleString()}. Exported copies cannot be recalled.`,
          );
          $("accept-button").disabled = false;
        })
        .catch((e) => text("invitation-permissions", e.message));
    };
    addEventListener("hashchange", reviewInvitation);
    reviewInvitation();
    load().catch(() =>
      text(
        "care-status",
        "Private permissions are unavailable. Invitations remain disabled.",
      ),
    );
    addEventListener("focus", async () => {
      try {
        const session = await get("/api/health/care-access");
        if (!session.ok || session.payload.accountKey !== actorKey)
          clearShared();
        else if (selected) {
          const permission = await get(sharedUrl(selected));
          if (!permission.ok) clearShared();
        }
        await load();
      } catch {
        clearShared();
        text("care-status", "Permissions could not be refreshed.");
      }
    });
    addEventListener("pagehide", () => {
      clearShared();
      invitationFragment = "";
    });
  }
})();
