const $ = (id) => document.getElementById(id);

let state = null;
let currentTab = "desk";

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data;
}

function showBanner(message, isError = false) {
  const banner = $("banner");
  if (!message) {
    banner.classList.add("hidden");
    banner.textContent = "";
    return;
  }
  banner.classList.remove("hidden");
  banner.textContent = message;
  banner.style.background = isError ? "#fdecea" : "#e8f1fb";
  banner.style.borderColor = isError ? "#f0c7c2" : "#b5d4f5";
}

function card(item, kind) {
  const article = document.createElement("article");
  if (item.scheduledLabel || item.postedLabel) {
    const when = document.createElement("p");
    when.className = "when";
    if (item.windowOpen) when.classList.add("open");
    if (kind === "posted") when.classList.add("posted");
    when.textContent =
      kind === "posted"
        ? `${item.dryRun ? "Dry run" : "Posted"} · ${item.postedLabel || item.dateLocal}`
        : `${item.windowOpen ? "Due now" : "Scheduled"} · ${item.scheduledLabel}`;
    article.append(when);
  }
  const meta = document.createElement("p");
  meta.className = "meta";
  meta.textContent = [item.topic, item.format, kind === "draft" ? item.createdAt?.slice(0, 10) : ""]
    .filter(Boolean)
    .join(" · ");
  if (meta.textContent) article.append(meta);
  const body = document.createElement("pre");
  body.textContent = item.text;
  if (item.imageUrl) {
    const img = document.createElement("img");
    img.className = "card-image";
    img.src = item.imageUrl;
    img.alt = item.topic || "Post image";
    article.append(img);
  }
  article.append(body);

  if (kind === "draft" || kind === "queue") {
    const actions = document.createElement("div");
    actions.className = "card-actions";
    if (kind === "draft") {
      actions.append(
        action("Queue this", () => approve(item.fileName)),
        action("Publish now", () => publish({ fileName: item.fileName, from: "draft" }), true),
        action("Save edits", () => saveEdits("drafts", item.fileName, body)),
        action(item.imageUrl ? "Remove image" : "Add image", () => toggleImage("drafts", item)),
        action("Discard", () => remove("drafts", item.fileName), false, true),
      );
    } else {
      actions.append(
        action("Publish now", () => publish({ fileName: item.fileName }), true),
        action("Save edits", () => saveEdits("queue", item.fileName, body)),
        action(item.imageUrl ? "Remove image" : "Add image", () => toggleImage("queue", item)),
        action("Remove", () => remove("queue", item.fileName), false, true),
      );
    }
    body.contentEditable = "true";
    article.append(actions);
  }
  return article;
}

function action(label, onClick, primary = false, danger = false) {
  const button = document.createElement("button");
  button.textContent = label;
  if (primary) button.className = "primary";
  if (danger) button.classList.add("danger");
  button.addEventListener("click", () => run(onClick));
  return button;
}

async function run(fn) {
  try {
    showBanner("");
    await fn();
    await refresh({ keepBanner: true });
  } catch (error) {
    showBanner(error.message, true);
  }
}

async function refresh(options = {}) {
  state = await api("/api/status");
  $("count-drafts").textContent = String(state.counts.drafts);
  $("count-queue").textContent = String(state.counts.queued);
  $("count-posted").textContent = String(state.counts.posted);
  $("count-leads").textContent = String(state.counts.leads ?? 0);
  $("count-comments").textContent = String(state.counts.comments ?? 0);
  $("comments-note").textContent = state.autoComment
    ? `Relevant Odoo, AI, and technology posts. Up to ${state.commentDailyMax} comments post themselves each day when the thread has a LinkedIn id.`
    : `Relevant Odoo, AI, and technology posts. Review the draft, then post it. Set AUTO_COMMENT=true to send up to ${state.commentDailyMax} a day.`;
  $("queue-ready").textContent = `${state.counts.queued}/${state.queueMin || 5}`;
  $("queue-min").textContent = String(state.queueMin || 5);
  $("auth-line").textContent = state.auth.ok
    ? `Signed in as ${state.auth.name}`
    : state.auth.error || state.auth.name;
  $("next-window").textContent = state.schedule.next;
  $("cadence").textContent = state.schedule.label;
  $("why").textContent = state.schedule.why;
  if (!options.keepBanner) {
    if (!state.profileReady) {
      showBanner("Fill the Niche tab before generating. Keep it on Odoo, AI, and technology.");
    } else if (!state.hasOpenAi) {
      showBanner("Add OPENAI_API_KEY to .env to generate drafts. You can still write posts in Queue.");
    } else {
      showBanner("");
    }
  }

  renderList("drafts-list", state.drafts, "draft");
  renderList("queue-list", state.queue, "queue");
  renderList("posted-list", state.history, "posted");
  renderComments(state.comments || []);
  renderLeads(state.leads || []);
  $("profile-text").value = state.profile;
  $("topics-text").value = state.topics;
}

function renderList(id, items, kind) {
  const root = $(id);
  root.replaceChildren();
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "why";
    empty.textContent = "Nothing here yet.";
    root.append(empty);
    return;
  }
  for (const item of items) root.append(card(item, kind));
}

async function generate() {
  showBanner("Generating an Odoo / AI / tech draft…");
  const data = await api("/api/drafts", {
    method: "POST",
    body: JSON.stringify({ topic: $("topic").value, image: $("image-mode").value }),
  });
  currentTab = "drafts";
  setTab();
  showBanner(
    data.generated.image
      ? `Draft ready with image: ${data.generated.topic}`
      : `Draft ready (text only): ${data.generated.topic}`,
  );
}

async function approve(fileName) {
  await api(`/api/drafts/${encodeURIComponent(fileName)}/approve`, { method: "POST" });
  currentTab = "queue";
  setTab();
}

async function publish(payload) {
  const data = await api("/api/publish", { method: "POST", body: JSON.stringify(payload) });
  currentTab = "posted";
  setTab();
  showBanner(`Published ${data.id}`);
}

async function saveEdits(kind, fileName, bodyEl) {
  await api(`/api/${kind}/${encodeURIComponent(fileName)}`, {
    method: "PUT",
    body: JSON.stringify({ text: bodyEl.textContent }),
  });
  showBanner("Saved.");
}

async function toggleImage(kind, item) {
  if (item.imageUrl) {
    await api(`/api/${kind}/${encodeURIComponent(item.fileName)}`, {
      method: "PUT",
      body: JSON.stringify({ image: null }),
    });
    showBanner("Image removed.");
    return;
  }
  showBanner("Generating a LinkedIn image…");
  await api(`/api/${kind}/${encodeURIComponent(item.fileName)}/image`, { method: "POST" });
  showBanner("Image attached.");
}

async function remove(kind, fileName) {
  await api(`/api/${kind}/${encodeURIComponent(fileName)}`, { method: "DELETE" });
}

function setTab() {
  for (const button of document.querySelectorAll("nav button")) {
    button.classList.toggle("active", button.dataset.tab === currentTab);
  }
  for (const section of document.querySelectorAll("main .tab")) {
    section.classList.toggle("hidden", section.id !== `tab-${currentTab}`);
  }
}

document.querySelectorAll("nav button").forEach((button) => {
  button.addEventListener("click", () => {
    currentTab = button.dataset.tab;
    setTab();
  });
});

function postLink(url, title) {
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = title || url;
  return link;
}

function renderComments(comments) {
  const root = $("comments-list");
  root.replaceChildren();
  if (!comments.length) {
    const empty = document.createElement("p");
    empty.className = "why";
    empty.textContent = "No comments yet. Find posts about Odoo, ERP, or applied AI.";
    root.append(empty);
    return;
  }
  for (const item of comments) {
    const article = document.createElement("article");
    const meta = document.createElement("p");
    meta.className = "meta";
    meta.textContent = [item.status, item.postUrn ? "can comment via API" : "copy onto the thread", item.foundAt?.slice(0, 10)]
      .filter(Boolean)
      .join(" · ");
    const title = document.createElement("p");
    title.className = "when";
    title.append(postLink(item.url, item.title));
    const snippet = document.createElement("p");
    snippet.className = "why";
    snippet.textContent = item.snippet || "";
    const body = document.createElement("pre");
    body.textContent = item.comment || "";
    body.contentEditable = "true";
    const actions = document.createElement("div");
    actions.className = "card-actions";
    if (item.status !== "commented") {
      actions.append(
        action("Post comment", () => postTargetComment(item.id, body), true),
        action("Save", () => saveTargetComment(item.id, body)),
        action("Skip", () => skipTargetComment(item.id), false, true),
      );
    }
    article.append(meta, title, snippet, body, actions);
    if (item.error) {
      const err = document.createElement("p");
      err.className = "why";
      err.textContent = item.error;
      article.append(err);
    }
    root.append(article);
  }
}

function renderLeads(leads) {
  const root = $("leads-list");
  root.replaceChildren();
  if (!leads.length) {
    const empty = document.createElement("p");
    empty.className = "why";
    empty.textContent = "No leads yet. Find posts from people looking for a development team.";
    root.append(empty);
    return;
  }
  for (const lead of leads) {
    const article = document.createElement("article");
    const meta = document.createElement("p");
    meta.className = "meta";
    meta.textContent = [lead.status, lead.foundAt?.slice(0, 10)].filter(Boolean).join(" · ");
    const title = document.createElement("p");
    title.className = "when";
    title.append(postLink(lead.url, lead.title));
    const snippet = document.createElement("p");
    snippet.className = "why";
    snippet.textContent = lead.snippet || "";
    const actions = document.createElement("div");
    actions.className = "card-actions";
    if (lead.status !== "contacted" && lead.status !== "skipped") {
      actions.append(
        action("Save", () => setLeadStatus(lead.id, "saved"), true),
        action("Contacted", () => setLeadStatus(lead.id, "contacted")),
        action("Skip", () => setLeadStatus(lead.id, "skipped"), false, true),
      );
    }
    article.append(meta, title, snippet, actions);
    root.append(article);
  }
}

async function postTargetComment(id, body) {
  showBanner("Posting comment…");
  await api(`/api/comments/${encodeURIComponent(id)}/comment`, {
    method: "POST",
    body: JSON.stringify({ comment: body.textContent }),
  });
  showBanner("Comment posted.");
}

async function saveTargetComment(id, body) {
  await api(`/api/comments/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({ comment: body.textContent }),
  });
  showBanner("Comment saved.");
}

async function skipTargetComment(id) {
  await api(`/api/comments/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({ status: "skipped" }),
  });
  showBanner("Comment skipped.");
}

async function setLeadStatus(id, status) {
  await api(`/api/leads/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
  showBanner(status === "skipped" ? "Lead skipped." : status === "contacted" ? "Marked contacted." : "Lead saved.");
}

$("btn-generate").addEventListener("click", () => run(generate));
$("btn-add-comment").addEventListener("click", () =>
  run(async () => {
    showBanner("Drafting a comment…");
    await api("/api/comments", {
      method: "POST",
      body: JSON.stringify({ url: $("comment-url").value.trim() }),
    });
    $("comment-url").value = "";
    showBanner("Comment drafted. Review it, then post.");
  }),
);
$("btn-scan-comments").addEventListener("click", () =>
  run(async () => {
    showBanner("Searching relevant posts…");
    const result = await api("/api/comments/scan", { method: "POST" });
    showBanner(`Found ${result.added} posts. Drafted ${result.drafted} comments.`);
  }),
);
$("btn-add-lead").addEventListener("click", () =>
  run(async () => {
    await api("/api/leads", {
      method: "POST",
      body: JSON.stringify({ url: $("lead-url").value.trim() }),
    });
    $("lead-url").value = "";
    showBanner("Lead added.");
  }),
);
$("btn-scan-leads").addEventListener("click", () =>
  run(async () => {
    showBanner("Searching for people looking to hire…");
    const result = await api("/api/leads/scan", { method: "POST" });
    showBanner(`Found ${result.added} new leads.`);
  }),
);
$("btn-publish-next").addEventListener("click", () => run(() => publish({})));
$("btn-queue").addEventListener("click", () =>
  run(async () => {
    await api("/api/queue", {
      method: "POST",
      body: JSON.stringify({ text: $("manual-text").value, topic: "manual" }),
    });
    $("manual-text").value = "";
  }),
);
$("btn-save-niche").addEventListener("click", () =>
  run(async () => {
    await api("/api/profile", {
      method: "PUT",
      body: JSON.stringify({
        profile: $("profile-text").value,
        topics: $("topics-text").value,
      }),
    });
    showBanner("Niche saved.");
  }),
);

refresh().catch((error) => showBanner(error.message, true));
