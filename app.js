const APP_CONFIG = window.ACTIONABLES_CONFIG ?? {};
const APP_NAME = APP_CONFIG.appName || "Actionables";
const PREVIEW_STORAGE_KEY = "actionables-preview-v2";
const UI_STORAGE_KEY = "actionables-ui-v2";
const DAY_MS = 24 * 60 * 60 * 1000;
const root = document.querySelector("#appRoot");

const shortDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

const monthLabelFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
});

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
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
  budgetSettings: null,
  budgetExpenses: [],
  activeTab: loadUiPrefs().activeTab || "personal",
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
  state.budgetSettings = dashboard.budgetSettings || null;
  state.budgetExpenses = dashboard.budgetExpenses || [];
  state.loading = false;
  normalizeActiveTab();
  normalizeSelection();
  persistUiPrefs();
}

function normalizeActiveTab() {
  if (!["personal", "shared", "budget"].includes(state.activeTab)) {
    state.activeTab = "personal";
  }
}

function normalizeSelection() {
  if (state.activeTab === "budget") {
    return;
  }

  const scopedLists = getListsForTab(state.activeTab);
  const scopedListIds = new Set(scopedLists.map((list) => list.id));

  if (!scopedListIds.has(state.selectedListId)) {
    const preferredList =
      scopedLists.find((list) => getOpenTaskCountForList(list.id) > 0) ||
      scopedLists[0] ||
      null;
    state.selectedListId = preferredList ? preferredList.id : null;
  }
}

function render() {
  if (state.loading) {
    root.innerHTML = renderLoading();
    return;
  }

  try {
    if (state.mode === "live" && !state.user) {
      root.innerHTML = renderAuth();
      return;
    }

    root.innerHTML = renderDashboard();
  } catch (error) {
    console.error("Render failure", error);
    root.innerHTML = renderFatalError(error);
  }
}

function renderLoading() {
  return `
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">${escapeHtml(APP_NAME)}</p>
        <h1>Open the list. Keep the house moving.</h1>
        <p class="hero-text">
          Pulling your shared lists and monthly budget into place.
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

function renderFatalError(error) {
  return `
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">${escapeHtml(APP_NAME)}</p>
        <h1>Something tripped during render.</h1>
        <p class="hero-text">
          ${escapeHtml(getErrorMessage(error))}
        </p>
      </div>
    </section>
    <section class="panel">
      <div class="empty-state">
        Refresh once. If it keeps happening, this message helps us pinpoint the exact failing view.
      </div>
    </section>
  `;
}

function renderAuth() {
  const isSignIn = state.authView === "sign-in";
  return `
    <header class="hero">
      <div class="hero-copy">
        <p class="eyebrow">${escapeHtml(APP_NAME)}</p>
        <h1>Shared lists for the house. Personal lists and budget for the month.</h1>
        <p class="hero-text">
          Built for groceries, quick errands, and one shared money view that both
          of you can actually keep updated.
        </p>
      </div>
    </header>

    <section class="banner">
      <div class="banner-copy">
        <span class="mode-chip live">Connected to Supabase</span>
        <p>Sign in to keep your personal lists, shared lists, and household budget in sync.</p>
      </div>
    </section>

    <section class="auth-shell">
      <section class="panel">
        <div class="auth-copy">
          <div>
            <p class="panel-kicker">Why it fits</p>
            <h2>Same feel as the workout tracker, now tuned for list life and the monthly spend.</h2>
          </div>

          <div class="mini-grid">
            <article class="mini-card">
              <p class="mini-label">Personal lists</p>
              <h4>Your own stops</h4>
              <p>Keep pickups, reminders, and one-off errands in your lane.</p>
            </article>
            <article class="mini-card">
              <p class="mini-label">Shared lists</p>
              <h4>One house view</h4>
              <p>Groceries, Target runs, and weekend resets live in one place for both of you.</p>
            </article>
            <article class="mini-card">
              <p class="mini-label">Shared budget</p>
              <h4>Income and outgoing</h4>
              <p>Set one monthly income number and track the shared expenses against it.</p>
            </article>
            <article class="mini-card">
              <p class="mini-label">Browser-first</p>
              <h4>No app store work</h4>
              <p>Supabase handles auth and sync, so you only maintain one web app.</p>
            </article>
          </div>

          <div class="subpanel">
            <div class="section-heading">
              <h3>First run</h3>
            </div>
            <ol class="setup-list">
              <li>Create one shared space from the account panel.</li>
              <li>Have your wife join with the shared-space code.</li>
              <li>Start with one personal list each, one shared list, and your shared monthly income.</li>
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
                ? "If sign-in fails right after signup, Supabase may still be waiting on email confirmation."
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
  return `
    <header class="hero">
      <div class="hero-copy">
        <p class="eyebrow">${escapeHtml(APP_NAME)}</p>
        <h1>House lists, personal lists, and a simple shared budget.</h1>
        <p class="hero-text">
          One place for groceries, errands, your own stops, and the month’s
          outgoing spend.
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
              ? "This demo is seeded with personal lists, shared lists, and a simple monthly budget so you can feel the full app."
              : `Signed in as ${escapeHtml(state.user.display_name || state.user.email)}.`
          }
        </p>
      </div>
      <p class="status-line ${state.error ? "error" : ""}">
        ${escapeHtml(state.error || state.message)}
      </p>
    </section>

    ${renderTabStrip()}
    ${renderCurrentTab()}
  `;
}

function renderTabStrip() {
  return `
    <section class="tab-strip" aria-label="Workspace tabs">
      ${renderTabButton("personal", "Personal Lists")}
      ${renderTabButton("shared", "Shared Lists")}
      ${renderTabButton("budget", "Budget")}
    </section>
  `;
}

function renderTabButton(tabId, label) {
  return `
    <button
      type="button"
      class="tab-button ${state.activeTab === tabId ? "active" : ""}"
      data-action="set-tab"
      data-tab-id="${escapeAttribute(tabId)}"
    >
      ${escapeHtml(label)}
    </button>
  `;
}

function renderCurrentTab() {
  if (state.activeTab === "shared") {
    return renderSharedTab();
  }
  if (state.activeTab === "budget") {
    return renderBudgetTab();
  }
  return renderPersonalTab();
}

function renderPersonalTab() {
  const summary = getTaskSummaryForScope("private");
  const selectedList = getSelectedListForTab("personal");
  const filteredTasks = getVisibleTasks(selectedList);
  const attention = getAttentionGroupsForScope("private");

  return `
    <section class="summary-grid" aria-label="Personal list summary">
      ${renderSummaryCard("Open tasks", summary.openTasks, summary.openMeta)}
      ${renderSummaryCard("Overdue", summary.overdueTasks, summary.overdueMeta)}
      ${renderSummaryCard("Personal lists", summary.listCount, summary.listMeta)}
      ${renderSummaryCard("Checked off", summary.completedThisMonth, summary.completedMeta)}
    </section>

    <section class="workspace-grid">
      ${renderListPanel({
        scope: "private",
        title: "Your personal lists",
        meta: summary.panelMeta,
        createHeading: "Create a personal list",
        createCopy: "Use this for your own pickups, reminders, and one-off errands.",
        placeholder: "My stops",
      })}
      ${renderTaskDeckPanel({
        selectedList,
        filteredTasks,
        scope: "private",
        emptyChip: "Personal lists live just for you",
      })}
    </section>

    ${renderAttentionPanel({
      title: "Personal queue",
      kicker: "At a glance",
      meta: summary.attentionMeta,
      helper: "These are the personal items that still need attention.",
      groups: attention,
    })}
  `;
}

function renderSharedTab() {
  const summary = getTaskSummaryForScope("shared");
  const selectedList = getSelectedListForTab("shared");
  const filteredTasks = getVisibleTasks(selectedList);
  const attention = getAttentionGroupsForScope("shared");

  return `
    <section class="summary-grid" aria-label="Shared list summary">
      ${renderSummaryCard("Open tasks", summary.openTasks, summary.openMeta)}
      ${renderSummaryCard("Due today", summary.dueToday, summary.dueTodayMeta)}
      ${renderSummaryCard("Shared lists", summary.listCount, summary.listMeta)}
      ${renderSummaryCard("Members", state.household ? state.members.length : 0, state.household ? "Everyone in the shared space." : "Create the space first.")}
    </section>

    <section class="workspace-grid">
      ${renderListPanel({
        scope: "shared",
        title: state.household ? `${householdName()} lists` : "Shared lists",
        meta: state.household
          ? "Visible to both accounts."
          : "Create or join the shared space before you make shared lists.",
        createHeading: "Create a shared list",
        createCopy: "Use this for groceries, house resets, and anything both of you touch.",
        placeholder: "Weekly groceries",
      })}
      ${renderTaskDeckPanel({
        selectedList,
        filteredTasks,
        scope: "shared",
        emptyChip: state.household ? householdName() : "Shared space not connected yet",
      })}
    </section>

    <section class="support-grid">
      ${renderAttentionPanel({
        title: "Shared queue",
        kicker: "At a glance",
        meta: summary.attentionMeta,
        helper: "Pick any card to jump into the shared list it belongs to.",
        groups: attention,
      })}
      ${renderHouseholdPanel({ showChecklist: true })}
    </section>
  `;
}

function renderBudgetTab() {
  const summary = getBudgetSummary();
  const currentMonthExpenses = getCurrentMonthBudgetExpenses();

  if (!state.household) {
    return `
      <section class="summary-grid" aria-label="Budget summary">
        ${renderSummaryCard("Monthly income", formatCurrency(0), "Turns on after shared setup.")}
        ${renderSummaryCard("Outgoing", formatCurrency(0), "No shared budget yet.")}
        ${renderSummaryCard("Left to spend", formatCurrency(0), "Create the shared space first.")}
        ${renderSummaryCard("Entries", 0, "Nothing tracked yet.")}
      </section>

      <section class="workspace-grid">
        <section class="panel budget-panel">
          <div class="panel-header">
            <div>
              <p class="panel-kicker">Budget</p>
              <h2>Connect the shared space first</h2>
            </div>
            <p class="panel-meta">The budget is shared between both accounts.</p>
          </div>

          <div class="empty-state">
            Create or join the household in the Shared Lists tab first. Once both
            of you are connected, the Budget tab becomes one shared monthly view.
          </div>
        </section>

        ${renderHouseholdPanel({ showChecklist: false })}
      </section>
    `;
  }

  return `
    <section class="summary-grid" aria-label="Budget summary">
      ${renderSummaryCard("Monthly income", formatCurrency(summary.income), "The shared income target for this month.")}
      ${renderSummaryCard("Outgoing", formatCurrency(summary.expenses), "All shared expenses logged this month.")}
      ${renderSummaryCard("Left to spend", formatCurrency(summary.remaining), summary.remaining >= 0 ? "Still available this month." : "You are over the target.")}
      ${renderSummaryCard("Entries", summary.expenseCount, summary.expenseCount === 1 ? "One expense logged." : `${summary.expenseCount} expenses logged.`)}
    </section>

    <section class="workspace-grid">
      <section class="panel budget-panel">
        <div class="panel-header">
          <div>
            <p class="panel-kicker">Budget</p>
            <h2>${escapeHtml(summary.monthLabel)}</h2>
          </div>
          <p class="panel-meta">Shared with ${escapeHtml(householdName())}.</p>
        </div>

        <section class="subpanel">
          <div class="section-heading">
            <h3>Set shared income</h3>
            <p class="section-meta">One monthly number for both accounts.</p>
          </div>
          <form id="budgetIncomeForm" class="form-stack">
            <label class="field">
              <span>Monthly income</span>
              <input
                name="monthlyIncome"
                type="number"
                min="0"
                step="0.01"
                inputmode="decimal"
                value="${escapeAttribute(formatNumberInput(summary.income))}"
                placeholder="5800.00"
                required
              />
            </label>
            <div class="form-actions">
              <button class="button button-primary" type="submit">Save income</button>
            </div>
          </form>
        </section>

        <section class="subpanel">
          <div class="section-heading">
            <h3>Add outgoing expense</h3>
            <p class="section-meta">Track the shared spend for this month.</p>
          </div>
          <form id="budgetExpenseForm" class="form-stack">
            <label class="field">
              <span>Expense name</span>
              <input name="title" type="text" maxlength="120" placeholder="Rent" required />
            </label>
            <div class="form-row">
              <label class="field">
                <span>Amount</span>
                <input name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="1200.00" required />
              </label>
              <label class="field">
                <span>Date</span>
                <input name="expenseDate" type="date" value="${escapeAttribute(todayKey())}" required />
              </label>
            </div>
            <label class="field">
              <span>Notes</span>
              <textarea
                name="notes"
                rows="3"
                placeholder="Optional note, account detail, or reminder..."
              ></textarea>
            </label>
            <div class="form-actions">
              <button class="button button-primary" type="submit">Add expense</button>
            </div>
          </form>
        </section>
      </section>

      <section class="panel budget-panel">
        <div class="panel-header">
          <div>
            <p class="panel-kicker">Monthly outgoing</p>
            <h2>${escapeHtml(summary.monthLabel)}</h2>
          </div>
          <p class="panel-meta">${escapeHtml(`${currentMonthExpenses.length} ${currentMonthExpenses.length === 1 ? "entry" : "entries"} this month`)}</p>
        </div>

        <section class="subpanel">
          <div class="budget-rollup">
            <div>
              <p class="mini-label">Remaining</p>
              <h3>${escapeHtml(formatCurrency(summary.remaining))}</h3>
            </div>
            <div class="budget-rollup-meta">
              <span class="chip">Income ${escapeHtml(formatCurrency(summary.income))}</span>
              <span class="chip">Outgoing ${escapeHtml(formatCurrency(summary.expenses))}</span>
            </div>
          </div>
        </section>

        <div class="expense-list">
          ${renderBudgetExpenseCards(currentMonthExpenses)}
        </div>
      </section>
    </section>
  `;
}

function renderListPanel({ scope, title, meta, createHeading, createCopy, placeholder }) {
  const lists = getListsForScope(scope);
  const lockedShared = scope === "shared" && !state.household;

  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <p class="panel-kicker">${scope === "shared" ? "Shared lists" : "Personal lists"}</p>
          <h2>${escapeHtml(title)}</h2>
        </div>
        <p class="panel-meta">${escapeHtml(meta)}</p>
      </div>

      <div class="list-strip">
        <div class="list-grid">
          ${renderListCards(scope)}
        </div>

        <div class="subpanel">
          <div class="section-heading">
            <h3>${escapeHtml(createHeading)}</h3>
            <p class="section-meta">${escapeHtml(createCopy)}</p>
          </div>
          <form id="listForm" class="form-stack">
            <input type="hidden" name="scope" value="${escapeAttribute(scope)}" />
            <label class="field">
              <span>List name</span>
              <input
                name="name"
                type="text"
                maxlength="80"
                placeholder="${escapeAttribute(placeholder)}"
                ${lockedShared ? "disabled" : ""}
                required
              />
            </label>
            <label class="field">
              <span>Accent</span>
              <select name="accent" ${lockedShared ? "disabled" : ""}>
                <option value="terracotta">Terracotta</option>
                <option value="forest">Forest</option>
                <option value="ocean">Ocean</option>
                <option value="sand">Sand</option>
                <option value="berry">Berry</option>
              </select>
            </label>
            <div class="form-actions">
              <button class="button button-primary" type="submit" ${lockedShared ? "disabled" : ""}>
                Create list
              </button>
            </div>
            <p class="helper-text">
              ${
                scope === "shared"
                  ? escapeHtml(
                      state.household
                        ? "This list will show up for both of you."
                        : "Create or join the shared space first to unlock shared lists."
                    )
                  : "These lists stay in your own personal lane."
              }
            </p>
          </form>
        </div>

        ${
          lists.length === 0
            ? `<div class="empty-state">${escapeHtml(
                scope === "shared" ? "No shared lists yet." : "No personal lists yet."
              )}</div>`
            : ""
        }
      </div>
    </section>
  `;
}

function renderTaskDeckPanel({ selectedList, filteredTasks, scope, emptyChip }) {
  return `
    <section class="panel detail-panel" aria-labelledby="detailTitle">
      <div class="panel-header detail-header">
        <div>
          <p class="panel-kicker">Task deck</p>
          <div class="detail-title-row">
            <h2 id="detailTitle">${escapeHtml(selectedList ? selectedList.name : `Pick a ${scope} list`)}</h2>
            ${
              selectedList
                ? `<span class="scope-chip">${selectedList.scope === "shared" ? "Shared" : "Personal"}</span>`
                : ""
            }
          </div>
          <div class="list-context">
            ${
              selectedList
                ? `
                    <span class="chip">Open ${getOpenTaskCountForList(selectedList.id)}</span>
                    <span class="chip">Done ${getDoneTaskCountForList(selectedList.id)}</span>
                    <span class="chip">${escapeHtml(selectedList.scope === "shared" ? householdName() : "Just for you")}</span>
                  `
                : `<span class="chip">${escapeHtml(emptyChip)}</span>`
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
                  <input
                    name="title"
                    type="text"
                    maxlength="160"
                    placeholder="${escapeAttribute(scope === "shared" ? "Grab eggs, avocados, and coffee" : "Pick up dry cleaning")}"
                    required
                  />
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
                    placeholder="Store, aisle, pickup note, or anything else..."
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
                ${escapeHtml(
                  scope === "shared"
                    ? "Choose a shared list first. Then this panel becomes your task deck."
                    : "Choose a personal list first. Then this panel becomes your task deck."
                )}
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
  `;
}

function renderAttentionPanel({ title, kicker, meta, helper, groups }) {
  return `
    <section class="panel attention-panel" aria-labelledby="${escapeAttribute(title)}">
      <div class="panel-header">
        <div>
          <p class="panel-kicker">${escapeHtml(kicker)}</p>
          <h2>${escapeHtml(title)}</h2>
        </div>
        <p class="panel-meta">${escapeHtml(meta)}</p>
      </div>

      <p class="helper-text">${escapeHtml(helper)}</p>

      <div class="attention-grid">
        <section class="subpanel">
          <div class="section-heading">
            <h3>Overdue</h3>
            <span class="chip">${groups.overdue.length}</span>
          </div>
          <div class="attention-list">
            ${renderAttentionCards(groups.overdue, "Nothing overdue right now.")}
          </div>
        </section>

        <section class="subpanel">
          <div class="section-heading">
            <h3>Due today</h3>
            <span class="chip">${groups.dueToday.length}</span>
          </div>
          <div class="attention-list">
            ${renderAttentionCards(groups.dueToday, "Nothing due today.")}
          </div>
        </section>

        <section class="subpanel">
          <div class="section-heading">
            <h3>Recently checked off</h3>
            <span class="chip">${groups.recentDone.length}</span>
          </div>
          <div class="attention-list">
            ${renderAttentionCards(groups.recentDone, "No completed items yet.", { doneView: true })}
          </div>
        </section>
      </div>
    </section>
  `;
}

function renderHouseholdPanel({ showChecklist }) {
  return `
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
              <p class="section-meta">Everyone who can see the shared lists and budget.</p>
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

      ${
        showChecklist
          ? `
            <div class="subpanel" style="margin-top: 1rem;">
              <div class="section-heading">
                <h3>Launch checklist</h3>
                <p class="section-meta">The only setup you need on your side.</p>
              </div>
              <ol class="setup-list">
                <li>Create a Supabase project and run the included SQL schema.</li>
                <li>Put your Supabase URL and public browser key into <code>config.js</code>.</li>
                <li>Deploy this folder as its own site on Vercel.</li>
                <li>Create two accounts, then create or join the shared space once.</li>
              </ol>
            </div>
          `
          : ""
      }
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
  const lists = getListsForScope(scope);
  if (lists.length === 0) {
    return `<div class="empty-state">${scope === "shared" ? "No shared lists yet." : "No personal lists yet."}</div>`;
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
            <span class="scope-chip">${scope === "shared" ? "shared" : "personal"}</span>
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
            <span class="chip">${
              member.id === state.user.id ? `Personal lists ${personalLists}` : "Personal lists stay private"
            }</span>
            <span class="chip">${member.id === state.user.id ? "Signed in" : "Shared access"}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderBudgetExpenseCards(expenses) {
  if (expenses.length === 0) {
    return `<div class="empty-state">No shared expenses logged for this month yet.</div>`;
  }

  return expenses
    .map((expense) => {
      const creator = getMemberById(expense.created_by_user_id);
      const expenseDate = parseOptionalDateKey(expense.expense_date);
      return `
        <article class="expense-card">
          <div class="expense-topline">
            <div>
              <p class="mini-label">${escapeHtml(
                expenseDate ? shortDateFormatter.format(expenseDate) : "Unknown date"
              )}</p>
              <h4>${escapeHtml(expense.title)}</h4>
            </div>
            <div class="expense-actions">
              <span class="expense-amount">${escapeHtml(formatCurrency(expense.amount))}</span>
              <button
                class="button button-danger"
                type="button"
                data-action="delete-budget-expense"
                data-expense-id="${escapeAttribute(expense.id)}"
              >
                Remove
              </button>
            </div>
          </div>
          ${expense.notes ? `<p class="task-notes">${escapeHtml(expense.notes)}</p>` : ""}
          <div class="task-meta">
            <span class="chip">${escapeHtml(creator ? creator.display_name || creator.email : "Shared space")}</span>
            <span class="chip">${escapeHtml(expenseDate ? monthLabelFormatter.format(expenseDate) : "No month")}</span>
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

  if (action === "set-tab") {
    state.activeTab = target.dataset.tabId;
    normalizeSelection();
    persistUiPrefs();
    render();
    return;
  }

  if (action === "select-list") {
    const selectedList = state.lists.find((list) => list.id === target.dataset.listId);
    if (selectedList) {
      state.activeTab = selectedList.scope === "shared" ? "shared" : "personal";
    }
    state.selectedListId = target.dataset.listId;
    normalizeSelection();
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
      state.budgetSettings = null;
      state.budgetExpenses = [];
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

  if (action === "delete-budget-expense") {
    runMutation(async () => {
      await state.adapter.deleteBudgetExpense(target.dataset.expenseId);
      await hydrateDashboard();
      state.message = "Expense removed.";
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
      const scope = String(formData.get("scope") || "private");
      if (scope === "shared" && !state.household) {
        throw new Error("Create or join the shared space before adding shared lists.");
      }
      await state.adapter.createList({
        name: String(formData.get("name") || "").trim(),
        scope,
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

  if (form.id === "budgetIncomeForm") {
    runMutation(async () => {
      if (!state.household) {
        throw new Error("Create or join the shared space first.");
      }
      await state.adapter.updateBudgetSettings({
        householdId: state.household.id,
        monthlyIncome: parsePositiveAmount(String(formData.get("monthlyIncome") || "0"), true),
      });
      await hydrateDashboard();
      state.message = "Monthly income saved.";
    });
    return;
  }

  if (form.id === "budgetExpenseForm") {
    runMutation(async () => {
      if (!state.household) {
        throw new Error("Create or join the shared space first.");
      }
      await state.adapter.createBudgetExpense({
        householdId: state.household.id,
        title: String(formData.get("title") || "").trim(),
        amount: parsePositiveAmount(String(formData.get("amount") || "0")),
        expenseDate: String(formData.get("expenseDate") || "").trim() || todayKey(),
        notes: String(formData.get("notes") || "").trim(),
      });
      form.reset();
      const dateInput = form.querySelector('input[name="expenseDate"]');
      if (dateInput) {
        dateInput.value = todayKey();
      }
      await hydrateDashboard();
      state.message = "Expense added.";
    });
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

function getListsForScope(scope) {
  return state.lists.filter((list) => list.scope === scope);
}

function getTasksForScope(scope) {
  const listIds = new Set(getListsForScope(scope).map((list) => list.id));
  return state.tasks.filter((task) => listIds.has(task.list_id));
}

function getSelectedListForTab(tab) {
  if (tab === "budget") {
    return null;
  }
  const scope = tab === "shared" ? "shared" : "private";
  return state.lists.find((list) => list.id === state.selectedListId && list.scope === scope) || null;
}

function getListsForTab(tab) {
  return getListsForScope(tab === "shared" ? "shared" : "private");
}

function getTaskSummaryForScope(scope) {
  const tasks = getTasksForScope(scope);
  const lists = getListsForScope(scope);
  const openTasks = tasks.filter((task) => task.status === "open").length;
  const overdueTasks = tasks.filter((task) => task.status === "open" && task.due_date && task.due_date < todayKey()).length;
  const dueToday = tasks.filter((task) => task.status === "open" && task.due_date === todayKey()).length;
  const completedThisMonth = tasks.filter(
    (task) => task.status === "done" && task.completed_at && task.completed_at.slice(0, 7) === todayKey().slice(0, 7)
  ).length;
  const attentionTotal = overdueTasks + dueToday;

  return {
    openTasks,
    overdueTasks,
    dueToday,
    listCount: lists.length,
    completedThisMonth,
    openMeta: openTasks > 0 ? "Still on the board." : "Nothing open right now.",
    overdueMeta: overdueTasks > 0 ? "Needs a pass soon." : "Nothing has slipped.",
    dueTodayMeta: dueToday > 0 ? "Worth handling today." : "Nothing due today.",
    listMeta: lists.length > 0 ? `${lists.length} in this lane.` : "Create the first one.",
    completedMeta:
      completedThisMonth > 0
        ? `${completedThisMonth} ${completedThisMonth === 1 ? "task" : "tasks"} closed this month.`
        : "Nothing closed yet this month.",
    attentionMeta: attentionTotal > 0 ? `${attentionTotal} items need attention right now` : "Everything urgent is handled",
    panelMeta:
      scope === "shared"
        ? lists.length > 0
          ? "Visible to both of you."
          : "Set up a shared list for groceries, house runs, or weekend resets."
        : lists.length > 0
          ? "Only visible to you."
          : "Good for pickups, reminders, and your own stops.",
  };
}

function getBudgetSummary() {
  const income = Number(state.budgetSettings?.monthly_income || 0);
  const expenses = getCurrentMonthBudgetExpenses().reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  return {
    income,
    expenses,
    remaining: income - expenses,
    expenseCount: getCurrentMonthBudgetExpenses().length,
    monthLabel: monthLabelFormatter.format(new Date()),
  };
}

function getCurrentMonthBudgetExpenses() {
  const monthKey = todayKey().slice(0, 7);
  return state.budgetExpenses
    .filter((expense) => String(expense.expense_date || "").slice(0, 7) === monthKey)
    .sort((a, b) => {
      const byDate = String(b.expense_date || "").localeCompare(String(a.expense_date || ""));
      if (byDate !== 0) {
        return byDate;
      }
      return String(b.created_at || "").localeCompare(String(a.created_at || ""));
    });
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

function getAttentionGroupsForScope(scope) {
  const tasks = getTasksForScope(scope);
  const overdue = tasks
    .filter((task) => task.status === "open" && task.due_date && task.due_date < todayKey())
    .sort(compareTasks)
    .slice(0, 4);
  const dueToday = tasks
    .filter((task) => task.status === "open" && task.due_date === todayKey())
    .sort(compareTasks)
    .slice(0, 4);
  const recentDone = tasks
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

function formatCurrency(value) {
  return currencyFormatter.format(Number(value || 0));
}

function formatNumberInput(value) {
  return Number(value || 0).toFixed(2);
}

function parsePositiveAmount(rawValue, allowZero = false) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed < 0 || (!allowZero && parsed <= 0)) {
    throw new Error(allowZero ? "Enter a valid income amount." : "Enter a valid expense amount.");
  }
  return Number(parsed.toFixed(2));
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
      const visibleLists = preview.lists.filter(
        (list) => list.scope === "shared" || list.owner_user_id === preview.currentUserId
      );
      const visibleListIds = new Set(visibleLists.map((list) => list.id));
      const visibleTasks = preview.tasks.filter((task) => visibleListIds.has(task.list_id));
      return {
        user: currentUser,
        household: preview.household,
        members: preview.users,
        lists: visibleLists,
        tasks: visibleTasks,
        budgetSettings: preview.budgetSettings,
        budgetExpenses: preview.budgetExpenses,
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
    async updateBudgetSettings({ monthlyIncome }) {
      const preview = loadPreviewData();
      preview.budgetSettings = {
        ...preview.budgetSettings,
        household_id: preview.household.id,
        monthly_income: monthlyIncome,
        updated_at: new Date().toISOString(),
        updated_by_user_id: preview.currentUserId,
      };
      savePreviewData(preview);
    },
    async createBudgetExpense({ title, amount, expenseDate, notes }) {
      const preview = loadPreviewData();
      preview.budgetExpenses.unshift({
        id: crypto.randomUUID(),
        household_id: preview.household.id,
        title,
        amount,
        expense_date: expenseDate,
        notes,
        created_by_user_id: preview.currentUserId,
        created_at: new Date().toISOString(),
      });
      savePreviewData(preview);
    },
    async deleteBudgetExpense(expenseId) {
      const preview = loadPreviewData();
      preview.budgetExpenses = preview.budgetExpenses.filter((expense) => expense.id !== expenseId);
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
        budgetSettings: null,
        budgetExpenses: [],
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
    let budgetSettings = null;
    let budgetExpenses = [];

    if (membershipRows?.[0]) {
      const householdId = membershipRows[0].household_id;

      const { data: householdRows, error: householdError } = await supabase
        .from("households")
        .select("id, name, join_code, created_by, created_at")
        .eq("id", householdId)
        .limit(1);
      if (householdError) {
        throw householdError;
      }
      household = householdRows?.[0] || null;

      const { data: memberRows, error: memberRowsError } = await supabase
        .from("household_members")
        .select("user_id, role")
        .eq("household_id", householdId);
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

      try {
        const { data: budgetRows, error: budgetError } = await supabase
          .from("household_budget_settings")
          .select("household_id, monthly_income, updated_by_user_id, updated_at")
          .eq("household_id", householdId)
          .limit(1);
        if (budgetError) {
          throw budgetError;
        }
        if (budgetRows?.[0]) {
          budgetSettings = {
            ...budgetRows[0],
            monthly_income: Number(budgetRows[0].monthly_income || 0),
          };
        }
      } catch (error) {
        console.warn("Budget settings could not be loaded.", error);
      }

      try {
        const { data: expenseRows, error: expenseError } = await supabase
          .from("household_budget_expenses")
          .select("id, household_id, title, amount, expense_date, notes, created_by_user_id, created_at")
          .eq("household_id", householdId)
          .order("expense_date", { ascending: false })
          .order("created_at", { ascending: false });
        if (expenseError) {
          throw expenseError;
        }
        budgetExpenses = (expenseRows || []).map((expense) => ({
          ...expense,
          amount: Number(expense.amount || 0),
        }));
      } catch (error) {
        console.warn("Budget expenses could not be loaded.", error);
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
      budgetSettings,
      budgetExpenses,
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
    async updateBudgetSettings({ householdId, monthlyIncome }) {
      const session = await getSession();
      const { error } = await supabase.from("household_budget_settings").upsert(
        {
          household_id: householdId,
          monthly_income: monthlyIncome,
          updated_by_user_id: session.user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "household_id" }
      );
      if (error) {
        throw error;
      }
    },
    async createBudgetExpense({ householdId, title, amount, expenseDate, notes }) {
      const session = await getSession();
      const { error } = await supabase.from("household_budget_expenses").insert({
        household_id: householdId,
        title,
        amount,
        expense_date: expenseDate,
        notes,
        created_by_user_id: session.user.id,
      });
      if (error) {
        throw error;
      }
    },
    async deleteBudgetExpense(expenseId) {
      const { error } = await supabase.from("household_budget_expenses").delete().eq("id", expenseId);
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
  const fourDaysAgo = dateKey(addDays(parseDateKey(today), -4));
  const twoDaysAgo = dateKey(addDays(parseDateKey(today), -2));

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
      {
        id: "list-private-wife",
        name: "Her stops",
        scope: "private",
        accent: "berry",
        household_id: null,
        owner_user_id: "preview-wife",
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
      {
        id: "task-6",
        list_id: "list-private-wife",
        title: "Return library books",
        notes: "",
        status: "open",
        due_date: twoDaysAgo,
        assigned_user_id: "preview-wife",
        created_by_user_id: "preview-wife",
        created_at: new Date().toISOString(),
        completed_at: null,
      },
    ],
    budgetSettings: {
      household_id: "household-preview",
      monthly_income: 5800,
      updated_by_user_id: "preview-you",
      updated_at: new Date().toISOString(),
    },
    budgetExpenses: [
      {
        id: "expense-1",
        household_id: "household-preview",
        title: "Rent",
        amount: 1850,
        expense_date: fourDaysAgo,
        notes: "Main household payment.",
        created_by_user_id: "preview-you",
        created_at: new Date().toISOString(),
      },
      {
        id: "expense-2",
        household_id: "household-preview",
        title: "Power bill",
        amount: 142.38,
        expense_date: yesterday,
        notes: "",
        created_by_user_id: "preview-wife",
        created_at: new Date().toISOString(),
      },
      {
        id: "expense-3",
        household_id: "household-preview",
        title: "Groceries",
        amount: 218.44,
        expense_date: today,
        notes: "Costco and produce stand.",
        created_by_user_id: "preview-you",
        created_at: new Date().toISOString(),
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
      activeTab: state.activeTab,
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

function parseOptionalDateKey(key) {
  if (!key) {
    return null;
  }
  const parsed = new Date(`${key}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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
