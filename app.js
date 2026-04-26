const APP_CONFIG = window.ACTIONABLES_CONFIG ?? {};
const APP_NAME = APP_CONFIG.appName || "Actionables";
const PREVIEW_STORAGE_KEY = "actionables-preview-v1";
const UI_STORAGE_KEY = "actionables-ui-v1";
const DAY_MS = 24 * 60 * 60 * 1000;
const root = document.querySelector("#appRoot");

const shortDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

const state = {
  adapter: null,
  mode: "preview",
  loading: true,
  busy: false,
  user: null,
  household: null,
  members: [],
  lists: [],
  tasks: [],
  selectedListId: loadUiPrefs().selectedListId || null,
  taskFilter: loadUiPrefs().taskFilter || "open",
  authView: "sign-in",
  message: "",
  error: "",
};

root.addEventListener("click", handleClick);
root.addEventListener("submit", handleSubmit);
root.addEventListener("change", handleChange);

init();

async function init() {
  render();
  try {
    if (isSupabaseConfigured()) {
      state.mode = "live";
      state.adapter = await createSupabaseAdapter(APP_CONFIG);
      const session = await state.adapter.getSession();
      if (session?.user) {
        await hydrateDashboard();
      } else {
        state.loading = false;
      }
    } else {
      state.mode = "preview";
      state.adapter = createPreviewAdapter();
      await hydrateDashboard();
    }
  } catch (error) {
    state.loading = false;
    state.error = getErrorMessage(error);
  }
  render();
}

async function hydrateDashboard() {
  state.loading = true;
  render();
  const dashboard = await state.adapter.getDashboardData();
  state.user = dashboard.user;
  state.household = dashboard.household;
  state.members = dashboard.members;
  state.lists = dashboard.lists;
  state.tasks = dashboard.tasks;
  state.loading = false;
  normalizeSelection();
  persistUiPrefs();
}

function normalizeSelection() {
  const accessibleListIds = new Set(state.lists.map((list) => list.id));
  if (!accessibleListIds.has(state.selectedListId)) {
    const preferredList =
      state.lists.find((list) => getOpenTaskCountForList(list.id) > 0) ||
      state.lists[0] ||
      null;
    state.selectedListId = preferredList ? preferredList.id : null;
  }
}

function render() {
  if (state.loading) {
    root.innerHTML = renderLoading();
    return;
  }

  if (state.mode === "live" && !state.user) {
    root.innerHTML = renderAuth();
    return;
  }

  root.innerHTML = renderDashboard();
}

function renderLoading() {
  return `
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">${escapeHtml(APP_NAME)}</p>
        <h1>Open the list. Keep the house moving.</h1>
        <p class="hero-text">
          Pulling your shared lists into place.
        </p>
      </div>
    </section>
    <section class="loading-shell" aria-hidden="true">
      <div class="loading-card"></div>
      <div class="loading-card"></div>
      <div class="loading-card"></div>
    </section>
  `;
}

function renderAuth() {
  const isSignIn = state.authView === "sign-in";
  return `
    <header class="hero">
      <div class="hero-copy">
        <p class="eyebrow">${escapeHtml(APP_NAME)}</p>
        <h1>Shared lists for the house. Personal lists for everything else.</h1>
        <p class="hero-text">
          Built for groceries, errands, quick pickups, and the small stuff you
          do not want to text back and forth all week.
        </p>
      </div>
    </header>

    <section class="banner">
      <div class="banner-copy">
        <span class="mode-chip live">Connected to Supabase</span>
        <p>Sign in to keep one shared space and one personal lane for each of you.</p>
      </div>
    </section>

    <section class="auth-shell">
      <section class="panel">
        <div class="auth-copy">
          <div>
            <p class="panel-kicker">Why it fits</p>
            <h2>Same feel as the workout tracker, tuned for lists you actually use every week.</h2>
          </div>

          <div class="mini-grid">
            <article class="mini-card">
              <p class="mini-label">Private lists</p>
              <h4>Your own stops</h4>
              <p>Keep personal pickups, reminders, and one-off errands out of the shared feed.</p>
            </article>
            <article class="mini-card">
              <p class="mini-label">Shared lists</p>
              <h4>One house view</h4>
              <p>Groceries, Target runs, weekend resets, and anything both of you touch.</p>
            </article>
            <article class="mini-card">
              <p class="mini-label">Fast capture</p>
              <h4>Quick to add</h4>
              <p>Drop in an item, pick a person, and move on without digging through menus.</p>
            </article>
            <article class="mini-card">
              <p class="mini-label">No backend chores</p>
              <h4>Browser-first</h4>
              <p>Supabase handles the account and data layer, so you only have one app to ship.</p>
            </article>
          </div>

          <div class="subpanel">
            <div class="section-heading">
              <h3>First run</h3>
            </div>
            <ol class="setup-list">
              <li>Create one shared space from the account panel.</li>
              <li>Have your wife join with the shared-space code.</li>
              <li>Start with a grocery list, a house list, and one personal list each.</li>
            </ol>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="auth-toggle">
          <div>
            <p class="panel-kicker">Account</p>
            <h2>${isSignIn ? "Welcome back" : "Create your account"}</h2>
          </div>
          <div class="toggle-group" role="tablist" aria-label="Authentication mode">
            <button
              type="button"
              class="${isSignIn ? "active" : ""}"
              data-action="switch-auth"
              data-auth-view="sign-in"
            >
              Sign in
            </button>
            <button
              type="button"
              class="${!isSignIn ? "active" : ""}"
              data-action="switch-auth"
              data-auth-view="sign-up"
            >
              Create account
            </button>
          </div>
        </div>

        <form id="${isSignIn ? "signInForm" : "signUpForm"}" class="form-stack auth-panel">
          ${
            isSignIn
              ? ""
              : `
                <label class="field">
                  <span>Display name</span>
                  <input name="displayName" type="text" maxlength="60" placeholder="Mike" required />
                </label>
              `
          }
          <label class="field">
            <span>Email</span>
            <input name="email" type="email" placeholder="you@example.com" required />
          </label>
          <label class="field">
            <span>Password</span>
            <input name="password" type="password" placeholder="At least 6 characters" required />
          </label>
          <div class="form-actions">
            <button class="button button-primary" type="submit">
              ${isSignIn ? "Sign in" : "Create account"}
            </button>
          </div>
          <p class="auth-footnote">
            ${
              isSignIn
                ? "If your sign-in fails right after signup, check whether Supabase is waiting for email confirmation."
                : "Supabase may send a confirmation email depending on your Auth settings."
            }
          </p>
          <p class="status-line ${state.error ? "error" : ""}">
            ${escapeHtml(state.error || state.message)}
          </p>
        </form>
      </section>
    </section>
  `;
}

function renderDashboard() {
  const summary = getSummaryMetrics();
  const selectedList = state.lists.find((list) => list.id === state.selectedListId) || null;
  const filteredTasks = getVisibleTasks(selectedList);
  const attention = getAttentionGroups();

  return `
    <header class="hero">
      <div class="hero-copy">
        <p class="eyebrow">${escapeHtml(APP_NAME)}</p>
        <h1>Shared lists for the house. Personal lists for everything else.</h1>
        <p class="hero-text">
          Groceries, errands, weekend pickups, and the little home reminders
          that are easier to keep in one place.
        </p>
      </div>

      <div class="hero-actions">
        ${
          state.mode === "preview"
            ? `
              <button class="button button-ghost" type="button" data-action="reset-preview">
                Reset demo
              </button>
            `
            : `
              <button class="button button-ghost" type="button" data-action="sign-out">
                Sign out
              </button>
            `
        }
      </div>
    </header>

    <section class="banner">
      <div class="banner-copy">
        <span class="mode-chip ${state.mode}">${state.mode === "preview" ? "Local preview" : "Live sync"}</span>
        <p>
          ${
            state.mode === "preview"
              ? "This demo is seeded with grocery and errand lists so you can feel the app before wiring up hosting."
              : `Signed in as ${escapeHtml(state.user.display_name || state.user.email)}.`
          }
        </p>
      </div>
      <p class="status-line ${state.error ? "error" : ""}">
        ${escapeHtml(state.error || state.message)}
      </p>
    </section>

    <section class="summary-grid" aria-label="Task summary">
      ${renderSummaryCard("Open tasks", summary.openTasks, summary.openMeta)}
      ${renderSummaryCard("Overdue", summary.overdueTasks, summary.overdueMeta)}
      ${renderSummaryCard("Private lists", summary.privateLists, summary.privateMeta)}
      ${renderSummaryCard("Shared lists", summary.sharedLists, summary.sharedMeta)}
    </section>

    <section class="workspace-grid">
      <section class="panel attention-panel" aria-labelledby="attentionTitle">
        <div class="panel-header">
          <div>
            <p class="panel-kicker">At a glance</p>
            <h2 id="attentionTitle">What needs a run</h2>
          </div>
          <p class="panel-meta">${escapeHtml(summary.attentionMeta)}</p>
        </div>

        <p class="helper-text">
          Pick any card below to jump straight into the list that item belongs to.
        </p>

        <div class="attention-grid">
          <section class="subpanel">
            <div class="section-heading">
              <h3>Overdue</h3>
              <span class="chip">${attention.overdue.length}</span>
            </div>
            <div class="attention-list">
              ${renderAttentionCards(attention.overdue, "Nothing overdue right now.")}
            </div>
          </section>

          <section class="subpanel">
            <div class="section-heading">
              <h3>Due today</h3>
              <span class="chip">${attention.dueToday.length}</span>
            </div>
            <div class="attention-list">
              ${renderAttentionCards(attention.dueToday, "Nothing due today.")}
            </div>
          </section>

          <section class="subpanel">
            <div class="section-heading">
              <h3>Recently checked off</h3>
              <span class="chip">${attention.recentDone.length}</span>
            </div>
            <div class="attention-list">
              ${renderAttentionCards(attention.recentDone, "No completed items yet.", { doneView: true })}
            </div>
          </section>
        </div>
      </section>

      <section class="panel detail-panel" aria-labelledby="detailTitle">
        <div class="panel-header detail-header">
          <div>
            <p class="panel-kicker">Task deck</p>
            <div class="detail-title-row">
              <h2 id="detailTitle">${escapeHtml(selectedList ? selectedList.name : "Pick a list")}</h2>
              ${
                selectedList
                  ? `<span class="scope-chip">${selectedList.scope === "shared" ? "Shared" : "Private"}</span>`
                  : ""
              }
            </div>
            <div class="list-context">
              ${
                selectedList
                  ? `
                    <span class="chip">Open ${getOpenTaskCountForList(selectedList.id)}</span>
                    <span class="chip">Done ${getDoneTaskCountForList(selectedList.id)}</span>
                    <span class="chip">${selectedList.scope === "shared" ? householdName() : "Just for you"}</span>
                  `
                  : `<span class="chip">Create your first list below</span>`
              }
            </div>
          </div>
          <select id="taskFilterSelect" class="select-inline" aria-label="Task filter">
            <option value="open" ${state.taskFilter === "open" ? "selected" : ""}>Open only</option>
            <option value="all" ${state.taskFilter === "all" ? "selected" : ""}>All tasks</option>
            <option value="done" ${state.taskFilter === "done" ? "selected" : ""}>Done only</option>
          </select>
        </div>

        ${
          selectedList
            ? `
              <section class="subpanel">
                <div class="section-heading">
                  <h3>Add a task</h3>
                  <p class="section-meta">Quick add into the selected list.</p>
                </div>
                <form id="taskForm" class="form-stack">
                  <label class="field">
                    <span>Task title</span>
                    <input name="title" type="text" maxlength="160" placeholder="Grab eggs, avocados, and coffee" required />
                  </label>
                  <div class="form-row">
                    <label class="field">
                      <span>Due date</span>
                      <input name="dueDate" type="date" />
                    </label>
                    <label class="field">
                      <span>Assigned to</span>
                      <select name="assignedUserId">
                        ${renderAssigneeOptions(selectedList)}
                      </select>
                    </label>
                  </div>
                  <label class="field">
                    <span>Notes</span>
                    <textarea
                      name="notes"
                      rows="3"
                      placeholder="Store, aisle, brand, pickup note, or anything else..."
                    ></textarea>
                  </label>
                  <div class="form-actions">
                    <button class="button button-primary" type="submit">Add task</button>
                  </div>
                </form>
              </section>
            `
            : `
              <section class="subpanel">
                <div class="empty-state">
                  Create a list first. Once you do, this panel becomes your quick-add task deck.
                </div>
              </section>
            `
        }

        <section class="subpanel">
          <div class="section-heading">
            <h3>Tasks</h3>
            <p class="section-meta">
              ${
                selectedList
                  ? `${filteredTasks.length} visible ${filteredTasks.length === 1 ? "task" : "tasks"} in this view`
                  : "No list selected"
              }
            </p>
          </div>
          <div class="task-list">
            ${renderTaskCards(filteredTasks, selectedList)}
          </div>
        </section>
      </section>
    </section>

    <section class="support-grid">
      <section class="panel">
        <div class="panel-header">
          <div>
            <p class="panel-kicker">Your lists</p>
            <h2>Your spaces</h2>
          </div>
          <p class="panel-meta">${escapeHtml(summary.listMeta)}</p>
        </div>

        <div class="list-strip">
          <div>
            <div class="list-strip-header">
              <h3>Private lists</h3>
              <span class="chip">${summary.privateLists}</span>
            </div>
            <div class="list-grid">
              ${renderListCards("private")}
            </div>
          </div>

          <div class="stack-divider"></div>

          <div>
            <div class="list-strip-header">
              <h3>Shared lists</h3>
              <span class="chip">${summary.sharedLists}</span>
            </div>
            <div class="list-grid">
              ${renderListCards("shared")}
            </div>
          </div>

          <div class="subpanel">
            <div class="section-heading">
              <h3>Create a list</h3>
              <p class="section-meta">
                Use private for your own stops and shared for anything both of you buy or track.
              </p>
            </div>
            <form id="listForm" class="form-stack">
              <label class="field">
                <span>List name</span>
                <input name="name" type="text" maxlength="80" placeholder="Weekly groceries" required />
              </label>
              <div class="form-row">
                <label class="field">
                  <span>Scope</span>
                  <select name="scope">
                    <option value="private">Private</option>
                    <option value="shared" ${state.household ? "" : "disabled"}>
                      Shared ${state.household ? "" : "(needs shared space)"}
                    </option>
                  </select>
                </label>
                <label class="field">
                  <span>Accent</span>
                  <select name="accent">
                    <option value="terracotta">Terracotta</option>
                    <option value="forest">Forest</option>
                    <option value="ocean">Ocean</option>
                    <option value="sand">Sand</option>
                    <option value="berry">Berry</option>
                  </select>
                </label>
              </div>
              <div class="form-actions">
                <button class="button button-primary" type="submit">Create list</button>
              </div>
              <p class="helper-text">
                ${escapeHtml(state.household ? "Shared lists show up for both accounts." : "Create or join a shared space to unlock shared lists.")}
              </p>
            </form>
          </div>
        </div>
      </section>

      <section class="panel" id="setupPanel">
        <div class="panel-header">
          <div>
            <p class="panel-kicker">Household</p>
            <h2>${escapeHtml(state.household ? householdName() : "Set up your shared space")}</h2>
          </div>
          <p class="panel-meta">${escapeHtml(state.user.display_name || state.user.email)}</p>
        </div>

        ${
          state.household
            ? `
              <div class="code-card">
                <div>
                  <p class="mini-label">Join code</p>
                  <span class="code-value">${escapeHtml(state.household.join_code)}</span>
                  <p class="code-meta">Use this once on the second account to join the same shared space.</p>
                </div>
                ${
                  state.mode === "preview"
                    ? ""
                    : `
                      <button class="button button-ghost" type="button" data-action="copy-code">
                        Copy code
                      </button>
                    `
                }
              </div>

              <div class="section-heading">
                <h3>Members</h3>
                <p class="section-meta">Everyone who can see the shared lists.</p>
              </div>
              <div class="member-list">
                ${renderMemberCards()}
              </div>
            `
            : `
              <div class="support-grid">
                <section class="subpanel">
                  <div class="section-heading">
                    <h3>Create your shared space</h3>
                    <p class="section-meta">Best for the first account.</p>
                  </div>
                  <form id="createHouseholdForm" class="form-stack">
                    <label class="field">
                      <span>Household name</span>
                      <input name="name" type="text" maxlength="80" placeholder="Home Base" required />
                    </label>
                    <div class="form-actions">
                      <button class="button button-primary" type="submit">Create space</button>
                    </div>
                  </form>
                </section>
                <section class="subpanel">
                  <div class="section-heading">
                    <h3>Join with a code</h3>
                    <p class="section-meta">Best for the second account.</p>
                  </div>
                  <form id="joinHouseholdForm" class="form-stack">
                    <label class="field">
                      <span>Join code</span>
                      <input name="joinCode" type="text" maxlength="16" placeholder="ACT-48291" required />
                    </label>
                    <div class="form-actions">
                      <button class="button button-primary" type="submit">Join space</button>
                    </div>
                  </form>
                </section>
              </div>
            `
        }

        <div class="subpanel" style="margin-top: 1rem;">
          <div class="section-heading">
            <h3>Launch checklist</h3>
            <p class="section-meta">The only setup you need on your side.</p>
          </div>
          <ol class="setup-list">
            <li>Create a Supabase project and run the included SQL schema.</li>
            <li>Put your Supabase URL and anon key into <code>config.js</code>.</li>
            <li>Deploy this folder as its own site on Vercel.</li>
            <li>Create two accounts, then create or join the shared space once.</li>
          </ol>
        </div>
      </section>
    </section>
  `;
}

function renderSummaryCard(label, value, meta) {
  return `
    <article class="summary-card">
      <p class="summary-label">${escapeHtml(label)}</p>
      <h2>${escapeHtml(String(value))}</h2>
      <p class="summary-meta">${escapeHtml(meta)}</p>
    </article>
  `;
}

function renderAttentionCards(tasks, emptyCopy, options = {}) {
  if (tasks.length === 0) {
    return `<div class="empty-state">${escapeHtml(emptyCopy)}</div>`;
  }

  return tasks
    .map((task) => {
      const list = state.lists.find((item) => item.id === task.list_id);
      const assignee = getMemberById(task.assigned_user_id);
      const meta = options.doneView
        ? `Done ${task.completed_at ? shortDateFormatter.format(new Date(task.completed_at)) : ""}`.trim()
        : task.due_date
          ? describeDueDate(task.due_date)
          : "No due date";

      return `
        <button
          type="button"
          class="attention-card"
          data-action="select-list"
          data-list-id="${escapeAttribute(task.list_id)}"
        >
          <p class="mini-label">${escapeHtml(list?.name || "List")}</p>
          <h4>${escapeHtml(task.title)}</h4>
          <p class="attention-copy">${escapeHtml(task.notes || "Open the list to add detail or check it off.")}</p>
          <div class="attention-meta">
            <span class="chip">${escapeHtml(meta)}</span>
            <span class="chip">${escapeHtml(assignee ? assignee.display_name || assignee.email : "Unassigned")}</span>
          </div>
        </button>
      `;
    })
    .join("");
}

function renderAssigneeOptions(selectedList) {
  const options =
    selectedList.scope === "shared" && state.members.length > 0 ? state.members : [state.user];
  return options
    .map((member) => {
      const isDefault = member.id === state.user.id;
      return `
        <option value="${escapeAttribute(member.id)}" ${isDefault ? "selected" : ""}>
          ${escapeHtml(member.display_name || member.email)}
        </option>
      `;
    })
    .join("");
}

function renderTaskCards(tasks, selectedList) {
  if (!selectedList) {
    return `<div class="empty-state">Select a list to see its tasks.</div>`;
  }

  if (tasks.length === 0) {
    return `<div class="empty-state">No tasks match this filter yet.</div>`;
  }

  return tasks
    .map((task) => {
      const assignee = getMemberById(task.assigned_user_id);
      const dueLabel = task.due_date ? describeDueDate(task.due_date) : "No due date";
      const done = task.status === "done";
      const classes = `task-card ${done ? "done" : ""}`;
      return `
        <article class="${classes}">
          <div class="task-topline">
            <div class="task-title-row">
              <button
                type="button"
                class="task-check ${done ? "done" : ""}"
                data-action="toggle-task"
                data-task-id="${escapeAttribute(task.id)}"
                aria-label="${done ? "Mark task open" : "Mark task complete"}"
              ></button>
              <div>
                <h4>${escapeHtml(task.title)}</h4>
                ${task.notes ? `<p class="task-notes">${escapeHtml(task.notes)}</p>` : ""}
              </div>
            </div>
            <button
              class="button button-danger"
              type="button"
              data-action="delete-task"
              data-task-id="${escapeAttribute(task.id)}"
            >
              Remove
            </button>
          </div>

          <div class="task-footer">
            <div class="task-meta">
              <span class="chip">${escapeHtml(dueLabel)}</span>
              <span class="chip">${escapeHtml(assignee ? `Assigned to ${assignee.display_name || assignee.email}` : "Unassigned")}</span>
              <span class="chip">${done ? `Done ${task.completed_at ? shortDateFormatter.format(new Date(task.completed_at)) : ""}`.trim() : "Open"}</span>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderListCards(scope) {
  const lists = state.lists.filter((list) => list.scope === scope);
  if (lists.length === 0) {
    return `<div class="empty-state">${scope === "shared" ? "No shared lists yet." : "No private lists yet."}</div>`;
  }

  return lists
    .map((list) => {
      const openCount = getOpenTaskCountForList(list.id);
      const doneCount = getDoneTaskCountForList(list.id);
      const active = list.id === state.selectedListId;
      return `
        <button
          type="button"
          class="list-card ${active ? "active" : ""}"
          data-accent="${escapeAttribute(list.accent || "terracotta")}"
          data-action="select-list"
          data-list-id="${escapeAttribute(list.id)}"
        >
          <div class="list-card-top">
            <div class="list-card-meta">
              <p class="mini-label">${scope === "shared" ? householdName() : "Personal"}</p>
              <h3>${escapeHtml(list.name)}</h3>
              <p>${escapeHtml(openCount > 0 ? `${openCount} ${openCount === 1 ? "item" : "items"} left` : "Everything on this list is checked off.")}</p>
            </div>
            <span class="scope-chip">${scope}</span>
          </div>
          <div class="list-card-stats">
            <span class="chip">Open ${openCount}</span>
            <span class="chip">Done ${doneCount}</span>
          </div>
        </button>
      `;
    })
    .join("");
}

function renderMemberCards() {
  if (state.members.length === 0) {
    return `<div class="empty-state">No members yet.</div>`;
  }

  return state.members
    .map((member) => {
      const personalLists = state.lists.filter(
        (list) => list.scope === "private" && list.owner_user_id === member.id
      ).length;
      return `
        <article class="member-card">
          <p class="mini-label">${member.id === state.user.id ? "You" : "Member"}</p>
          <h4>${escapeHtml(member.display_name || member.email)}</h4>
          <p class="member-meta">${escapeHtml(member.email || "")}</p>
          <div class="list-card-stats" style="margin-top:0.8rem;">
            <span class="chip">Private lists ${personalLists}</span>
            <span class="chip">${member.id === state.user.id ? "Signed in" : "Shared access"}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function handleClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target || state.busy) {
    return;
  }

  const action = target.dataset.action;

  if (action === "switch-auth") {
    state.authView = target.dataset.authView;
    state.error = "";
    state.message = "";
    render();
    return;
  }

  if (action === "select-list") {
    state.selectedListId = target.dataset.listId;
    persistUiPrefs();
    render();
    return;
  }

  if (action === "reset-preview") {
    runMutation(async () => {
      await state.adapter.resetPreview();
      await hydrateDashboard();
      state.message = "Preview data reset.";
    });
    return;
  }

  if (action === "sign-out") {
    runMutation(async () => {
      await state.adapter.signOut();
      state.user = null;
      state.household = null;
      state.members = [];
      state.lists = [];
      state.tasks = [];
      state.message = "";
      state.error = "";
      state.loading = false;
      render();
    });
    return;
  }

  if (action === "toggle-task") {
    runMutation(async () => {
      await state.adapter.toggleTask(target.dataset.taskId);
      await hydrateDashboard();
      state.message = "Task updated.";
    });
    return;
  }

  if (action === "delete-task") {
    runMutation(async () => {
      await state.adapter.deleteTask(target.dataset.taskId);
      await hydrateDashboard();
      state.message = "Task removed.";
    });
    return;
  }

  if (action === "copy-code") {
    runMutation(async () => {
      await navigator.clipboard.writeText(state.household.join_code);
      state.message = "Join code copied.";
      render();
    });
  }
}

function handleChange(event) {
  if (event.target.id === "taskFilterSelect") {
    state.taskFilter = event.target.value;
    persistUiPrefs();
    render();
    return;
  }
}

function handleSubmit(event) {
  event.preventDefault();
  if (state.busy) {
    return;
  }

  const form = event.target;
  const formData = new FormData(form);

  if (form.id === "signInForm") {
    runMutation(async () => {
      await state.adapter.signIn({
        email: String(formData.get("email") || "").trim(),
        password: String(formData.get("password") || ""),
      });
      await hydrateDashboard();
      state.message = "Signed in.";
      state.error = "";
    });
    return;
  }

  if (form.id === "signUpForm") {
    runMutation(async () => {
      const result = await state.adapter.signUp({
        displayName: String(formData.get("displayName") || "").trim(),
        email: String(formData.get("email") || "").trim(),
        password: String(formData.get("password") || ""),
      });
      if (result.session) {
        await hydrateDashboard();
        state.message = "Account created.";
      } else {
        state.authView = "sign-in";
        state.message = "Account created. Check your email if confirmation is enabled, then sign in.";
      }
      state.error = "";
      render();
    });
    return;
  }

  if (form.id === "taskForm") {
    runMutation(async () => {
      if (!state.selectedListId) {
        throw new Error("Choose a list before adding a task.");
      }
      await state.adapter.createTask({
        listId: state.selectedListId,
        title: String(formData.get("title") || "").trim(),
        dueDate: String(formData.get("dueDate") || "").trim(),
        assignedUserId: String(formData.get("assignedUserId") || "").trim(),
        notes: String(formData.get("notes") || "").trim(),
      });
      form.reset();
      await hydrateDashboard();
      state.message = "Task added.";
    });
    return;
  }

  if (form.id === "listForm") {
    runMutation(async () => {
      await state.adapter.createList({
        name: String(formData.get("name") || "").trim(),
        scope: String(formData.get("scope") || "private"),
        accent: String(formData.get("accent") || "terracotta"),
        householdId: state.household?.id || null,
      });
      form.reset();
      await hydrateDashboard();
      state.message = "List created.";
    });
    return;
  }

  if (form.id === "createHouseholdForm") {
    runMutation(async () => {
      await state.adapter.createHousehold({
        name: String(formData.get("name") || "").trim(),
      });
      await hydrateDashboard();
      state.message = "Household created.";
    });
    return;
  }

  if (form.id === "joinHouseholdForm") {
    runMutation(async () => {
      await state.adapter.joinHousehold({
        joinCode: String(formData.get("joinCode") || "").trim(),
      });
      await hydrateDashboard();
      state.message = "Household joined.";
    });
    return;
  }
}

async function runMutation(work) {
  state.busy = true;
  state.error = "";
  render();
  try {
    await work();
  } catch (error) {
    state.error = getErrorMessage(error);
  } finally {
    state.busy = false;
    render();
  }
}

function getSummaryMetrics() {
  const openTasks = state.tasks.filter((task) => task.status === "open").length;
  const overdueTasks = state.tasks.filter((task) => task.status === "open" && task.due_date && task.due_date < todayKey()).length;
  const dueToday = state.tasks.filter((task) => task.status === "open" && task.due_date === todayKey()).length;
  const privateLists = state.lists.filter((list) => list.scope === "private").length;
  const sharedLists = state.lists.filter((list) => list.scope === "shared").length;
  const completedThisMonth = state.tasks.filter(
    (task) => task.status === "done" && task.completed_at && task.completed_at.slice(0, 7) === todayKey().slice(0, 7)
  ).length;
  const attentionTotal = overdueTasks + dueToday;

  return {
    openTasks,
    overdueTasks,
    privateLists,
    sharedLists,
    openMeta: openTasks > 0 ? "Still on the board." : "Nothing open right now.",
    overdueMeta: overdueTasks > 0 ? "Needs a pass today." : "Nothing has slipped.",
    privateMeta: privateLists > 0 ? "Your side lists." : "Make one just for you.",
    sharedMeta: sharedLists > 0 ? "Visible to both of you." : "Shared lists unlock after setup.",
    attentionMeta: attentionTotal > 0 ? `${attentionTotal} items need attention right now` : "Everything urgent is handled",
    listMeta: `${completedThisMonth} checked off ${completedThisMonth === 1 ? "item" : "items"} this month`,
  };
}

function getVisibleTasks(selectedList) {
  if (!selectedList) {
    return [];
  }

  return state.tasks
    .filter((task) => task.list_id === selectedList.id)
    .filter((task) => {
      if (state.taskFilter === "all") {
        return true;
      }
      return task.status === state.taskFilter;
    })
    .sort(compareTasks);
}

function compareTasks(a, b) {
  const aDone = a.status === "done" ? 1 : 0;
  const bDone = b.status === "done" ? 1 : 0;
  if (aDone !== bDone) {
    return aDone - bDone;
  }

  const aDue = a.due_date || "9999-12-31";
  const bDue = b.due_date || "9999-12-31";
  if (aDue !== bDue) {
    return aDue.localeCompare(bDue);
  }

  return String(b.created_at || "").localeCompare(String(a.created_at || ""));
}

function getOpenTaskCountForList(listId) {
  return state.tasks.filter((task) => task.list_id === listId && task.status === "open").length;
}

function getDoneTaskCountForList(listId) {
  return state.tasks.filter((task) => task.list_id === listId && task.status === "done").length;
}

function getAttentionGroups() {
  const overdue = state.tasks
    .filter((task) => task.status === "open" && task.due_date && task.due_date < todayKey())
    .sort(compareTasks)
    .slice(0, 4);
  const dueToday = state.tasks
    .filter((task) => task.status === "open" && task.due_date === todayKey())
    .sort(compareTasks)
    .slice(0, 4);
  const recentDone = state.tasks
    .filter((task) => task.status === "done" && task.completed_at)
    .sort((a, b) => String(b.completed_at || "").localeCompare(String(a.completed_at || "")))
    .slice(0, 4);

  return { overdue, dueToday, recentDone };
}

function householdName() {
  return state.household?.name || "Shared space";
}

function getMemberById(memberId) {
  return state.members.find((member) => member.id === memberId) || null;
}

function describeDueDate(dateKey) {
  if (!dateKey) {
    return "No due date";
  }

  const today = parseDateKey(todayKey());
  const date = parseDateKey(dateKey);
  const diff = daysBetween(date, today);
  if (diff === 0) {
    return "Due today";
  }
  if (diff === 1) {
    return "Due tomorrow";
  }
  if (diff === -1) {
    return "Due yesterday";
  }
  if (diff > 1) {
    return `Due in ${diff} days`;
  }
  return `${Math.abs(diff)} days overdue`;
}

function createPreviewAdapter() {
  return {
    async getDashboardData() {
      const preview = loadPreviewData();
      const currentUser = preview.users.find((user) => user.id === preview.currentUserId);
      return {
        user: currentUser,
        household: preview.household,
        members: preview.users,
        lists: preview.lists,
        tasks: preview.tasks,
      };
    },
    async resetPreview() {
      localStorage.removeItem(PREVIEW_STORAGE_KEY);
    },
    async signOut() {},
    async signIn() {},
    async signUp() {
      return { session: null };
    },
    async createHousehold() {
      throw new Error("Preview mode already includes a household.");
    },
    async joinHousehold() {
      throw new Error("Preview mode already includes a household.");
    },
    async createList({ name, scope, accent }) {
      const preview = loadPreviewData();
      const list = {
        id: crypto.randomUUID(),
        name,
        scope,
        accent,
        owner_user_id: preview.currentUserId,
        household_id: scope === "shared" ? preview.household.id : null,
        created_at: new Date().toISOString(),
      };
      preview.lists.unshift(list);
      savePreviewData(preview);
    },
    async createTask({ listId, title, dueDate, assignedUserId, notes }) {
      const preview = loadPreviewData();
      preview.tasks.unshift({
        id: crypto.randomUUID(),
        list_id: listId,
        title,
        due_date: dueDate || null,
        assigned_user_id: assignedUserId || preview.currentUserId,
        notes,
        status: "open",
        completed_at: null,
        created_by_user_id: preview.currentUserId,
        created_at: new Date().toISOString(),
      });
      savePreviewData(preview);
    },
    async toggleTask(taskId) {
      const preview = loadPreviewData();
      preview.tasks = preview.tasks.map((task) => {
        if (task.id !== taskId) {
          return task;
        }
        const done = task.status === "done";
        return {
          ...task,
          status: done ? "open" : "done",
          completed_at: done ? null : new Date().toISOString(),
        };
      });
      savePreviewData(preview);
    },
    async deleteTask(taskId) {
      const preview = loadPreviewData();
      preview.tasks = preview.tasks.filter((task) => task.id !== taskId);
      savePreviewData(preview);
    },
  };
}

async function createSupabaseAdapter(config) {
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);

  async function getSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      throw error;
    }
    return data.session;
  }

  async function ensureProfile(user) {
    const payload = {
      id: user.id,
      email: user.email || "",
      display_name: user.user_metadata?.display_name || fallbackName(user.email),
    };
    const { error } = await supabase.from("profiles").upsert(payload);
    if (error) {
      throw error;
    }
    return payload;
  }

  async function getDashboardData() {
    const session = await getSession();
    if (!session?.user) {
      return {
        user: null,
        household: null,
        members: [],
        lists: [],
        tasks: [],
      };
    }

    await ensureProfile(session.user);
    const { data: profileRows, error: profileError } = await supabase
      .from("profiles")
      .select("id, email, display_name")
      .eq("id", session.user.id)
      .limit(1);
    if (profileError) {
      throw profileError;
    }
    const user = profileRows?.[0] || {
      id: session.user.id,
      email: session.user.email || "",
      display_name: session.user.user_metadata?.display_name || fallbackName(session.user.email),
    };

    const { data: membershipRows, error: membershipError } = await supabase
      .from("household_members")
      .select("household_id, role")
      .eq("user_id", user.id)
      .limit(1);
    if (membershipError) {
      throw membershipError;
    }

    let household = null;
    let members = [user];

    if (membershipRows?.[0]) {
      const { data: householdRows, error: householdError } = await supabase
        .from("households")
        .select("id, name, join_code, created_by, created_at")
        .eq("id", membershipRows[0].household_id)
        .limit(1);
      if (householdError) {
        throw householdError;
      }
      household = householdRows?.[0] || null;

      const { data: memberRows, error: memberRowsError } = await supabase
        .from("household_members")
        .select("user_id, role")
        .eq("household_id", membershipRows[0].household_id);
      if (memberRowsError) {
        throw memberRowsError;
      }

      const memberIds = (memberRows || []).map((row) => row.user_id);
      if (memberIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("id, email, display_name")
          .in("id", memberIds);
        if (profilesError) {
          throw profilesError;
        }
        members = memberIds
          .map((memberId) => profiles.find((profile) => profile.id === memberId))
          .filter(Boolean);
      }
    }

    const { data: lists, error: listsError } = await supabase
      .from("lists")
      .select("id, name, scope, accent, household_id, owner_user_id, created_at")
      .order("created_at", { ascending: true });
    if (listsError) {
      throw listsError;
    }

    let tasks = [];
    if ((lists || []).length > 0) {
      const listIds = lists.map((list) => list.id);
      const { data: taskRows, error: tasksError } = await supabase
        .from("tasks")
        .select(
          "id, list_id, title, notes, status, due_date, assigned_user_id, created_by_user_id, completed_at, created_at"
        )
        .in("list_id", listIds)
        .order("created_at", { ascending: false });
      if (tasksError) {
        throw tasksError;
      }
      tasks = taskRows || [];
    }

    return {
      user,
      household,
      members,
      lists: lists || [],
      tasks,
    };
  }

  return {
    getSession,
    getDashboardData,
    async signIn({ email, password }) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        throw error;
      }
    },
    async signUp({ displayName, email, password }) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName,
          },
        },
      });
      if (error) {
        throw error;
      }
      return data;
    },
    async signOut() {
      const { error } = await supabase.auth.signOut();
      if (error) {
        throw error;
      }
    },
    async createHousehold({ name }) {
      const { error } = await supabase.rpc("create_household_with_owner", {
        p_name: name,
        p_join_code: createJoinCode(),
      });
      if (error) {
        throw error;
      }
    },
    async joinHousehold({ joinCode }) {
      const { error } = await supabase.rpc("join_household_by_code", {
        p_join_code: joinCode.toUpperCase(),
      });
      if (error) {
        throw error;
      }
    },
    async createList({ name, scope, accent, householdId }) {
      const session = await getSession();
      const { error } = await supabase.from("lists").insert({
        name,
        scope,
        accent,
        owner_user_id: session.user.id,
        household_id: scope === "shared" ? householdId : null,
      });
      if (error) {
        throw error;
      }
    },
    async createTask({ listId, title, dueDate, assignedUserId, notes }) {
      const session = await getSession();
      const { error } = await supabase.from("tasks").insert({
        list_id: listId,
        title,
        notes,
        status: "open",
        due_date: dueDate || null,
        assigned_user_id: assignedUserId || null,
        created_by_user_id: session.user.id,
      });
      if (error) {
        throw error;
      }
    },
    async toggleTask(taskId) {
      const task = state.tasks.find((item) => item.id === taskId);
      if (!task) {
        return;
      }
      const nextDone = task.status !== "done";
      const { error } = await supabase
        .from("tasks")
        .update({
          status: nextDone ? "done" : "open",
          completed_at: nextDone ? new Date().toISOString() : null,
        })
        .eq("id", taskId);
      if (error) {
        throw error;
      }
    },
    async deleteTask(taskId) {
      const { error } = await supabase.from("tasks").delete().eq("id", taskId);
      if (error) {
        throw error;
      }
    },
  };
}

function isSupabaseConfigured() {
  return Boolean(APP_CONFIG.supabaseUrl && APP_CONFIG.supabaseAnonKey);
}

function createJoinCode() {
  return `ACT-${Math.floor(10000 + Math.random() * 90000)}`;
}

function fallbackName(email) {
  return String(email || "Member").split("@")[0] || "Member";
}

function loadPreviewData() {
  try {
    const raw = localStorage.getItem(PREVIEW_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (error) {
    console.warn("Could not load preview data.", error);
  }

  const today = todayKey();
  const yesterday = dateKey(addDays(parseDateKey(today), -1));
  const tomorrow = dateKey(addDays(parseDateKey(today), 1));
  const threeDaysAgo = dateKey(addDays(parseDateKey(today), -3));
  const sixDaysAgo = dateKey(addDays(parseDateKey(today), -6));

  const seeded = {
    currentUserId: "preview-you",
    household: {
      id: "household-preview",
      name: "Home Base",
      join_code: "ACT-48291",
    },
    users: [
      {
        id: "preview-you",
        email: "you@example.com",
        display_name: "You",
      },
      {
        id: "preview-wife",
        email: "wife@example.com",
        display_name: "Your Wife",
      },
    ],
    lists: [
      {
        id: "list-shared-food",
        name: "Weekly groceries",
        scope: "shared",
        accent: "terracotta",
        household_id: "household-preview",
        owner_user_id: "preview-you",
        created_at: new Date().toISOString(),
      },
      {
        id: "list-shared-home",
        name: "House run",
        scope: "shared",
        accent: "ocean",
        household_id: "household-preview",
        owner_user_id: "preview-wife",
        created_at: new Date().toISOString(),
      },
      {
        id: "list-private-you",
        name: "My stops",
        scope: "private",
        accent: "forest",
        household_id: null,
        owner_user_id: "preview-you",
        created_at: new Date().toISOString(),
      },
    ],
    tasks: [
      {
        id: "task-1",
        list_id: "list-shared-food",
        title: "Grab berries, oat milk, eggs, and coffee",
        notes: "Costco if the pantry list gets long.",
        status: "open",
        due_date: today,
        assigned_user_id: "preview-wife",
        created_by_user_id: "preview-you",
        created_at: new Date().toISOString(),
        completed_at: null,
      },
      {
        id: "task-2",
        list_id: "list-shared-home",
        title: "Restock paper towels and dish soap",
        notes: "Target is fine for this one.",
        status: "open",
        due_date: tomorrow,
        assigned_user_id: "preview-you",
        created_by_user_id: "preview-you",
        created_at: new Date().toISOString(),
        completed_at: null,
      },
      {
        id: "task-3",
        list_id: "list-private-you",
        title: "Pick up prescription refill",
        notes: "Before the pharmacy closes.",
        status: "open",
        due_date: threeDaysAgo,
        assigned_user_id: "preview-you",
        created_by_user_id: "preview-you",
        created_at: new Date().toISOString(),
        completed_at: null,
      },
      {
        id: "task-4",
        list_id: "list-shared-home",
        title: "Dog food and treats",
        notes: "",
        status: "done",
        due_date: yesterday,
        assigned_user_id: "preview-wife",
        created_by_user_id: "preview-you",
        created_at: new Date().toISOString(),
        completed_at: new Date(parseDateKey(yesterday).getTime() + 18 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: "task-5",
        list_id: "list-private-you",
        title: "Batteries for the office mouse",
        notes: "",
        status: "done",
        due_date: sixDaysAgo,
        assigned_user_id: "preview-you",
        created_by_user_id: "preview-you",
        created_at: new Date().toISOString(),
        completed_at: new Date(parseDateKey(sixDaysAgo).getTime() + 15 * 60 * 60 * 1000).toISOString(),
      },
    ],
  };

  savePreviewData(seeded);
  return seeded;
}

function savePreviewData(data) {
  localStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify(data));
}

function loadUiPrefs() {
  try {
    const raw = localStorage.getItem(UI_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.warn("Could not load UI prefs.", error);
    return {};
  }
}

function persistUiPrefs() {
  localStorage.setItem(
    UI_STORAGE_KEY,
    JSON.stringify({
      selectedListId: state.selectedListId,
      taskFilter: state.taskFilter,
    })
  );
}

function todayKey() {
  return dateKey(new Date());
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(key) {
  return new Date(`${key}T00:00:00`);
}

function stripTime(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function daysBetween(a, b) {
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcA - utcB) / DAY_MS);
}

function getErrorMessage(error) {
  if (!error) {
    return "Something went wrong.";
  }
  if (typeof error === "string") {
    return error;
  }
  if (error.message) {
    return error.message;
  }
  return "Something went wrong.";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
