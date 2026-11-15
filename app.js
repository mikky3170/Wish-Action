/**
 * ================================================================
 * Wish & Action コックピット コア・プログラム (app.js)
 * 哲学: やりたいこと(Wish)の発想原点(Why)を保持し、
 *       AIとの対話で今日すぐ着手できる初手を拓いて実行(Action)する。
 * アーキテクチャ: AIペット方式（自立型ローカル自動保存 ＋ JSONイン/アウト）
 * 画面設計・整合性:
 *   - 垂直動線連動（ヘッダー3カラムと下の3ペインが完全に垂直整合）
 *   - 3ペイン比率完全ロック（min-w-0 により長文でも 4:5.3:2.7 が崩れない）
 *   - 右ペインの入力ターゲットモード明示（✨ 新規アイデア ⇄ 🔄 構想の再構成）
 *   - ワンタップで新規入力に戻せる「＋ 新規に切替」ボタン
 *   - 中央ペイン最下部スマートガイダンスコンソール（助言の直下に次の一手を案内）
 *   - 視界のど真ん中（入力枠直下）に展開する対話型「🤖 AI深掘り受容質問カード」
 *   - 不足深掘り時の思考チェック＆受容（ダメ出し厳禁・共感と受容から入る対話）
 *   - ツッコミ入力枠への「✨ スッキリ推敲」連動（句点区切り・自然な日本語整形）
 *   - AI Studio水準の「✨ スッキリ推敲」（情報量100%維持・言い淀み排除・文脈段落分け）
 *   - 音声録音中の全枠呼吸・脈動発光（システムが声を聴いている没入表示）
 *   - 外部Gemini壁打ち用プロンプト生成・コピー機能（全体/個別テーマ）
 *   - 空間レイアウト完全共通化 ＆ 33%刻み進捗バー連動
 *   - 🌟【ガントチャート完全一元連携 ＆ スマートタブ切替】：
 *       ① 同一データキー（wish_action_tasks_v2）を共有し手動インポートを完全撤滅
 *       ② 開始日（startDate）と想定工数（hours）を非破壊拡張
 *       ③ 名前付きウィンドウターゲットによる安全なタブ行き来（未起動なら起動、起動済みならリロードなしで前面化）
 *       ④ storageイベントによるリアルタイム双方向同期（削除時クラッシュ防止ガード完備）
 *   - 🌟【Gemini API 堅牢化エンジン】：
 *       第1優先: gemini-3.5-flash-lite / 第2優先: gemini-flash-lite-latest
 *       段階的タイムアウト（10秒 ➔ 20秒 ➔ 30秒）による自動救済リトライ ＆ 明確なエラー通知
 *   - 🌟【鉄壁データ安全管理】：
 *       ①「🚀 スタジオ引継」：Thinking Studioからの案件を既存データを1件も消さず先頭に追加マージ
 *       ②「📂 復元」：システム完全復元（過去データ自動マイグレーション ＆ 誤爆ガード）
 *       ③ 起動時自動インボックスキュー連動
 * ================================================================
 */

// ==========================================
// 1. 定数 ＆ グローバル状態管理
// ==========================================
const STORAGE_KEY_SESSIONS = 'wish_action_sessions_v2';
const STORAGE_KEY_TASKS = 'wish_action_tasks_v2';
const STORAGE_KEY_API_KEY = 'wish_action_gemini_key';
const STORAGE_KEY_MODEL_LITE = 'wish_action_model_lite';
const STORAGE_KEY_MODEL_DEEP = 'wish_action_model_deep';
const STORAGE_KEY_CAL_SYNC = 'wish_action_cal_sync_enabled';
const STORAGE_KEY_GCAL_CLIENT_ID = 'wish_action_gcal_client_id';
const STORAGE_KEY_THEME = 'wish_action_theme';
const COCKPIT_INBOX_KEY = 'wish_action_studio_inbox_queue';

// 厳格固定モデル定義（第1優先: 3.5-flash-lite ／ 第2優先バックアップ: flash-lite-latest）
const MODEL_PRIMARY = 'gemini-3.5-flash-lite';
const MODEL_BACKUP  = 'gemini-flash-lite-latest';

// ウィンドウ名（タブ重複防止）
window.name = 'wish_action_cockpit_window';

// アプリケーション内部ステート
window.cockpitSessions = [];
window.cockpitTasks = [];
window.selectedSessionId = null;
window.selectedThemeId = null;
window.selectedTaskId = null;
window.currentLeftTab = 'actions'; // 'actions' | 'ideas'
window.currentSortMode = 'due';    // 'due' | 'priority' | 'created'
window.currentSortAsc = true;
window.selectedCategoryFilter = 'all';
window.isAttentionFilterActive = false;

// 右ペインの入力ターゲットモード管理 ('new' | 'reconstruct')
window.inputTargetMode = 'new';

// インライン編集状態管理
window.inlineEditingTaskId = null;
window.inlineEditingThemeId = null;
window.isWhyExpanded = false;

// アコーディオン開閉個別オーバーライド状態管理（taskId -> boolean）
window.taskAccordionOpenMap = {};

// 音声・AIステート
let recognition = null;
let isRecording = false;
let currentRawTranscript = '';
let currentAiMode = 'lite'; // 'lite' | 'deep'

// ツッコミ音声ステート
let commentRecognition = null;
let isCommentRecording = false;
let currentCommentRawTranscript = '';
let currentCommentHistory = [];

// 資料添付ステート
window.cockpitAttachments = [];

// Googleカレンダー連携ステート
let gcalTokenClient = null;
let gcalAccessToken = null;
let isCalendarSyncEnabled = false;

// ガントウィンドウの参照
let ganttWindowRef = null;

// ==========================================
// 2. データ初期化・永続化 ＆ バージョン同期
// ==========================================

function initDataStore() {
  try {
    const localSessions = localStorage.getItem(STORAGE_KEY_SESSIONS);
    const localTasks = localStorage.getItem(STORAGE_KEY_TASKS);

    if (localSessions && localTasks) {
      window.cockpitSessions = JSON.parse(localSessions);
      window.cockpitTasks = JSON.parse(localTasks);
    } else {
      const legacyTasks = localStorage.getItem('cockpit_tasks_v2') || localStorage.getItem('cockpit_tasks');
      const legacySessions = localStorage.getItem('cockpit_sessions_v2') || localStorage.getItem('cockpit_sessions');

      if (legacyTasks && legacySessions) {
        window.cockpitTasks = JSON.parse(legacyTasks);
        window.cockpitSessions = JSON.parse(legacySessions);
      } else {
        window.cockpitSessions = getInitialDefaultSessions();
        window.cockpitTasks = getInitialDefaultTasks();
      }
      saveDataToLocalStorage();
    }

    // ガントチャート連携プロパティの安全自動補完（過去データ完全後方互換）
    window.cockpitTasks.forEach(task => {
      if (task.hours === undefined) task.hours = 4;
      if (task.actualHours === undefined) task.actualHours = 0;
      if (task.startDate === undefined) {
        task.startDate = task.dueDate || formatTodayStr();
      }
    });

    // 厳格モデルの同期
    localStorage.setItem(STORAGE_KEY_MODEL_LITE, MODEL_PRIMARY);

  } catch (e) {
    console.error('データ初期化エラー:', e);
    window.cockpitSessions = [];
    window.cockpitTasks = [];
  }
}

function saveDataToLocalStorage() {
  try {
    localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(window.cockpitSessions));
    localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(window.cockpitTasks));
    updateAllBadgesAndIndicators();
    populateCategoryDatalist();
  } catch (e) {
    console.error('ローカルストレージ保存失敗:', e);
  }
}

function syncHeaderVersionFromMaster() {
  if (window.COCKPIT_VERSION_DATA && window.COCKPIT_VERSION_DATA.currentVersion) {
    const label = document.getElementById('header-version-label');
    if (label) {
      label.textContent = window.COCKPIT_VERSION_DATA.currentVersion;
    }
  }
}

/**
 * 🌟 ガントチャート画面へのスマート移動
 * （未起動なら新規起動、起動済みならリロードなしで前面フォーカス）
 */
function openGanttChartWindow() {
  if (ganttWindowRef && !ganttWindowRef.closed) {
    ganttWindowRef.focus();
  } else {
    ganttWindowRef = window.open('Gantt_chart.html', 'wish_action_gantt_window');
    if (ganttWindowRef) ganttWindowRef.focus();
  }
}

/**
 * 🌟 他タブ（ガントチャート等）での更新検知リスナー（クラッシュ完全防止ガード付）
 */
function setupStorageEventListener() {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY_TASKS) {
      try {
        const updated = localStorage.getItem(STORAGE_KEY_TASKS);
        if (updated) {
          window.cockpitTasks = JSON.parse(updated);

          // 削除ガード：選択中のタスクがガント側で消されていた場合は初期化
          if (window.selectedTaskId && !window.cockpitTasks.some(t => t.id === window.selectedTaskId)) {
            clearSelection();
          }

          renderTasks();
          renderCenterPane();
          updateAllBadgesAndIndicators();
          updateGuidanceBanner('🔄 ガントチャートと同期', 'ガントチャート側の変更がリアルタイムに反映されました。', false);
        }
      } catch (e) {
        console.warn('ストレージ同期エラー:', e);
      }
    } else if (event.key === STORAGE_KEY_THEME) {
      const newTheme = localStorage.getItem(STORAGE_KEY_THEME) || 'light';
      setTheme(newTheme);
    }
  });
}

// ==========================================
// 3. バッジ集計・判定 ＆ 監視スコープ連動ロジック
// ==========================================

function isTaskAttention(task) {
  if (!task || task.completed) return false;
  const isDueEmpty = !task.dueDate || String(task.dueDate).trim() === '';
  const isPriorityUndefined = task.priority === '未定' || !task.priority;
  const hasAttentionFlag = task.needsAttention === true;
  return isDueEmpty || isPriorityUndefined || hasAttentionFlag;
}

function updateAllBadgesAndIndicators() {
  const tasks = window.cockpitTasks || [];
  const sessions = window.cockpitSessions || [];

  const attentionCount = tasks.filter(t => isTaskAttention(t)).length;
  const badgeAttention = document.getElementById('count-needs-attention');
  if (badgeAttention) badgeAttention.textContent = attentionCount;

  const actionThemeIds = new Set(tasks.map(t => t.themeId).filter(Boolean));
  let stockIdeaCount = 0;
  sessions.forEach(sess => {
    (sess.themes || []).forEach(th => {
      if (!actionThemeIds.has(th.id) || th.isIdeaStock === true) {
        stockIdeaCount++;
      }
    });
  });

  const badgeIdeas = document.getElementById('count-stock-ideas');
  if (badgeIdeas) badgeIdeas.textContent = stockIdeaCount;

  const tabCountActions = document.getElementById('tab-count-actions');
  if (tabCountActions) tabCountActions.textContent = tasks.filter(t => !t.completed).length;

  const tabCountIdeas = document.getElementById('tab-count-ideas');
  if (tabCountIdeas) tabCountIdeas.textContent = stockIdeaCount;

  const btnAttention = document.getElementById('badge-needs-attention');
  const btnIdeas = document.getElementById('badge-stock-ideas');

  if (window.isAttentionFilterActive) {
    if (btnAttention) {
      btnAttention.className = 'h-full flex items-center justify-center gap-1.5 px-2.5 rounded-lg bg-amber-500 text-white text-xs font-mono font-black shadow-md border-2 border-amber-300 transition cursor-pointer ring-2 ring-amber-400/50 shrink-0';
    }
    if (btnIdeas) {
      btnIdeas.className = 'h-full flex items-center justify-center gap-1.5 px-2.5 rounded-lg bg-indigo-500/15 border border-indigo-500/40 text-indigo-800 dark:text-indigo-300 text-xs font-mono font-bold shadow-sm hover:opacity-90 transition cursor-pointer shrink-0';
    }
  } else if (window.currentLeftTab === 'ideas') {
    if (btnIdeas) {
      btnIdeas.className = 'h-full flex items-center justify-center gap-1.5 px-2.5 rounded-lg bg-indigo-600 text-white text-xs font-mono font-black shadow-md border-2 border-indigo-300 transition cursor-pointer ring-2 ring-indigo-400/50 shrink-0';
    }
    if (btnAttention) {
      btnAttention.className = 'h-full flex items-center justify-center gap-1.5 px-2.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-800 dark:text-amber-300 text-xs font-mono font-bold shadow-sm hover:opacity-90 transition cursor-pointer shrink-0';
    }
  } else {
    if (btnAttention) {
      btnAttention.className = 'h-full flex items-center justify-center gap-1.5 px-2.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-800 dark:text-amber-300 text-xs font-mono font-bold shadow-sm hover:opacity-90 transition cursor-pointer shrink-0';
    }
    if (btnIdeas) {
      btnIdeas.className = 'h-full flex items-center justify-center gap-1.5 px-2.5 rounded-lg bg-indigo-500/15 border border-indigo-500/40 text-indigo-800 dark:text-indigo-300 text-xs font-mono font-bold shadow-sm hover:opacity-90 transition cursor-pointer shrink-0';
    }
  }
}

// ==========================================
// 4. ガイダンス・コンソール制御
// ==========================================

function updateGuidanceBanner(statusTitle, guideText, isAttention = false, insightText = '') {
  const banner = document.getElementById('smart-context-banner');
  const titleEl = document.getElementById('banner-status-title');
  const guideEl = document.getElementById('banner-action-guide');
  const insightEl = document.getElementById('banner-context-insight');

  if (titleEl) titleEl.textContent = statusTitle;
  if (guideEl) guideEl.textContent = guideText;

  if (insightEl) {
    if (insightText) {
      insightEl.textContent = insightText.startsWith('*') ? insightText : `* ${insightText}`;
      insightEl.classList.remove('hidden');
    } else {
      const attentionCount = (window.cockpitTasks || []).filter(t => isTaskAttention(t)).length;
      if (attentionCount > 0) {
        insightEl.textContent = `* 期日・重要度が未設定のアクションが${attentionCount}件あります。鉛筆から確定しましょう。`;
      } else {
        insightEl.textContent = '* 初手を実行したら「メモへ取込」を押してチェックリスト化しましょう。';
      }
      insightEl.classList.remove('hidden');
    }
  }

  if (banner) {
    if (isAttention) {
      banner.classList.add('guidance-active-pulse');
    } else {
      banner.classList.remove('guidance-active-pulse');
    }
  }
}

// ==========================================
// 5. 左ペイン：タブ切替 ＆ ソート ＆ 区分フィルタ
// ==========================================

function switchLeftPaneView(tab) {
  window.currentLeftTab = tab;
  window.isAttentionFilterActive = false;

  const tabBtnActions = document.getElementById('tab-btn-actions');
  const tabBtnIdeas = document.getElementById('tab-btn-ideas');
  const containerActions = document.getElementById('container-actions-view');
  const containerIdeas = document.getElementById('container-ideas-view');
  const filterSortBar = document.getElementById('filter-sort-bar');

  if (tab === 'actions') {
    tabBtnActions.className = 'px-3.5 py-1 rounded-lg text-xs font-black transition flex items-center gap-1.5 bg-sky-600 text-white shadow-sm cursor-pointer';
    tabBtnIdeas.className = 'px-3.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer';
    if (containerActions) containerActions.classList.remove('hidden');
    if (containerIdeas) containerIdeas.classList.add('hidden');
    if (filterSortBar) filterSortBar.classList.remove('hidden');
    renderTasks();
  } else {
    tabBtnIdeas.className = 'px-3.5 py-1 rounded-lg text-xs font-black transition flex items-center gap-1.5 bg-sky-600 text-white shadow-sm cursor-pointer';
    tabBtnActions.className = 'px-3.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer';
    if (containerActions) containerActions.classList.add('hidden');
    if (containerIdeas) containerIdeas.classList.remove('hidden');
    if (filterSortBar) filterSortBar.classList.add('hidden');
    renderStockIdeas();
  }
  updateRightPaneButtons();
  updateAllBadgesAndIndicators();
  if (window.lucide) lucide.createIcons();
}

function toggleLeftPaneView(view) {
  switchLeftPaneView(view);
}

function filterAttentionTasks() {
  window.currentLeftTab = 'actions';
  window.isAttentionFilterActive = true;

  const tabBtnActions = document.getElementById('tab-btn-actions');
  const tabBtnIdeas = document.getElementById('tab-btn-ideas');
  const containerActions = document.getElementById('container-actions-view');
  const containerIdeas = document.getElementById('container-ideas-view');
  const filterSortBar = document.getElementById('filter-sort-bar');

  tabBtnActions.className = 'px-3.5 py-1 rounded-lg text-xs font-black transition flex items-center gap-1.5 bg-sky-600 text-white shadow-sm cursor-pointer';
  tabBtnIdeas.className = 'px-3.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer';
  if (containerActions) containerActions.classList.remove('hidden');
  if (containerIdeas) containerIdeas.classList.add('hidden');
  if (filterSortBar) filterSortBar.classList.remove('hidden');

  renderTasks();
  updateAllBadgesAndIndicators();

  const sectionAttention = document.getElementById('section-attention');
  if (sectionAttention) {
    sectionAttention.scrollIntoView({ behavior: 'smooth', block: 'start' });
    updateGuidanceBanner('⚠️ 仕込み中を表示中', '期日や重要度が未設定のアクションです。「目標日未設定」または鉛筆から確定してください。', true, '* 目標日を設定するとカレンダー・ガントチャートと完全同期します。');
  }
}

function toggleSortMode(mode) {
  if (window.currentSortMode === mode) {
    window.currentSortAsc = !window.currentSortAsc;
  } else {
    window.currentSortMode = mode;
    window.currentSortAsc = true;
  }

  ['due', 'priority', 'created'].forEach(m => {
    const btn = document.getElementById(`sort-btn-${m}`);
    const indicator = document.getElementById(`sort-indicator-${m}`);
    if (m === mode) {
      if (btn) btn.className = 'px-2.5 py-1 rounded-lg font-black bg-sky-600 text-white shadow-sm transition flex items-center gap-0.5 cursor-pointer';
      if (indicator) {
        indicator.textContent = window.currentSortAsc ? '▲' : '▼';
        indicator.classList.remove('opacity-0');
      }
    } else {
      if (btn) btn.className = 'px-2.5 py-1 rounded-lg font-bold t-text-muted hover:t-text-main transition flex items-center gap-0.5 cursor-pointer';
      if (indicator) indicator.classList.add('opacity-0');
    }
  });

  renderTasks();
}

function toggleCategoryDropdown(event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById('menu-category-dropdown');
  const icon = document.getElementById('icon-cat-dropdown');
  if (menu) {
    const isHidden = menu.classList.contains('hidden');
    if (isHidden) {
      buildCategoryDropdownItems();
      menu.classList.remove('hidden');
      if (icon) icon.classList.add('rotate-180');
    } else {
      menu.classList.add('hidden');
      if (icon) icon.classList.remove('rotate-180');
    }
  }
}

function buildCategoryDropdownItems() {
  const container = document.getElementById('dropdown-items-container');
  if (!container) return;
  container.innerHTML = '';

  const tasks = window.cockpitTasks || [];
  const categories = ['all', ...new Set(tasks.map(t => t.category).filter(Boolean))];

  categories.forEach(cat => {
    const count = cat === 'all' ? tasks.length : tasks.filter(t => t.category === cat).length;
    const btn = document.createElement('button');
    btn.className = `w-full px-3 py-1.5 text-left hover:bg-sky-500/10 flex items-center justify-between transition ${
      window.selectedCategoryFilter === cat ? 'font-black text-sky-600 dark:text-sky-400 bg-sky-500/5' : 't-text-main'
    }`;
    btn.onclick = (e) => {
      e.stopPropagation();
      selectCategoryFilter(cat);
      toggleCategoryDropdown();
    };
    btn.innerHTML = `
      <span class="truncate">${cat === 'all' ? 'すべて' : escapeHtml(cat)}</span>
      <span class="text-[10px] t-text-muted font-bold">(${count})</span>
    `;
    container.appendChild(btn);
  });
}

function selectCategoryFilter(cat) {
  window.selectedCategoryFilter = cat;
  const label = document.getElementById('label-selected-category');
  const tasks = window.cockpitTasks || [];
  const count = cat === 'all' ? tasks.length : tasks.filter(t => t.category === cat).length;
  if (label) {
    label.textContent = `${cat === 'all' ? 'すべて' : cat} (${count})`;
  }
  renderTasks();
}

// ==========================================
// 6. 左ペイン：タスク一覧 ＆ 空間共通インライン編集
// ==========================================

function renderTasks() {
  const containerActive = document.getElementById('tasks-active-container');
  const containerAttention = document.getElementById('tasks-attention-container');
  const containerCompleted = document.getElementById('tasks-completed-container');
  const sectionAttention = document.getElementById('section-attention');
  const sectionCompleted = document.getElementById('section-completed');

  if (!containerActive) return;

  containerActive.innerHTML = '';
  if (containerAttention) containerAttention.innerHTML = '';
  if (containerCompleted) containerCompleted.innerHTML = '';

  let tasks = [...window.cockpitTasks];

  if (window.selectedCategoryFilter !== 'all') {
    tasks = tasks.filter(t => t.category === window.selectedCategoryFilter);
  }

  sortTaskList(tasks);

  const attentionList = [];
  const activeList = [];
  const completedList = [];

  tasks.forEach(t => {
    if (t.completed) {
      completedList.push(t);
    } else if (isTaskAttention(t)) {
      attentionList.push(t);
    } else {
      activeList.push(t);
    }
  });

  if (attentionList.length > 0) {
    if (sectionAttention) sectionAttention.classList.remove('hidden');
    attentionList.forEach(t => {
      containerAttention.appendChild(createTaskCardElement(t, true));
    });
  } else {
    if (sectionAttention) sectionAttention.classList.add('hidden');
  }

  const activeCountLabel = document.getElementById('active-tasks-count');
  if (activeCountLabel) activeCountLabel.textContent = `${activeList.length}件`;

  if (activeList.length === 0) {
    containerActive.innerHTML = '<div class="text-center py-8 t-text-muted text-xs font-bold">登録されたやりたいことはありません</div>';
  } else {
    activeList.forEach(t => {
      containerActive.appendChild(createTaskCardElement(t, false));
    });
  }

  const completedCountLabel = document.getElementById('count-completed-tasks');
  if (completedCountLabel) completedCountLabel.textContent = completedList.length;

  if (completedList.length > 0) {
    if (sectionCompleted) sectionCompleted.classList.remove('hidden');
    completedList.forEach(t => {
      containerCompleted.appendChild(createTaskCardElement(t, false));
    });
  } else {
    if (sectionCompleted) sectionCompleted.classList.add('hidden');
  }

  updateAllBadgesAndIndicators();
}

function createTaskCardElement(task, isAttention) {
  const isSelected = window.selectedTaskId === task.id;
  const isEditing = window.inlineEditingTaskId === task.id;

  const card = document.createElement('div');
  card.id = `task-card-${task.id}`;
  card.className = `p-3 rounded-xl border transition-all cursor-pointer interactive-card ${
    isSelected ? 'spotlight-active' : 't-card hover:border-sky-500/50'
  } ${task.completed ? 'opacity-60 bg-slate-500/5' : ''}`;
  card.onclick = () => selectTask(task.id);

  if (isEditing) {
    card.onclick = null;
    const checkItems = parseChecklistFromNote(task.progressNote || '');
    const hasChecklist = checkItems.length > 0;
    const currentPercent = task.progressPercent || 0;

    card.innerHTML = `
      <div class="flex items-center justify-between pb-1.5 border-b border-inherit text-xs font-bold text-sky-600 dark:text-sky-400">
        <span class="flex items-center gap-1"><i data-lucide="edit-3" class="w-3.5 h-3.5"></i> アクション直接編集</span>
        <button type="button" onclick="cancelInlineTaskEdit(event)" class="t-text-muted hover:t-text-main"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
      </div>

      <div class="space-y-2 pt-2 text-xs" onclick="event.stopPropagation()">
        <div class="grid grid-cols-[3fr_2fr] gap-2">
          <div>
            <label class="block text-[10px] font-bold t-text-sub mb-0.5">やりたいこと名称</label>
            <input type="text" id="inline-task-title-${task.id}" value="${escapeHtml(task.title)}" maxlength="50" class="w-full p-1.5 t-card border rounded-lg t-text-main font-bold focus:outline-none focus:border-sky-500">
          </div>
          <div>
            <label class="block text-[10px] font-bold t-text-sub mb-0.5">区分</label>
            <input type="text" id="inline-task-category-${task.id}" value="${escapeHtml(task.category || '')}" list="category-datalist" class="w-full p-1.5 t-card border rounded-lg t-text-main font-medium focus:outline-none focus:border-sky-500">
          </div>
        </div>

        <!-- 日程＆工数 4項目グリッド（ガント完全連動） -->
        <div class="grid grid-cols-4 gap-1.5 p-2 rounded-xl t-card-sub border">
          <div>
            <label class="block text-[10px] font-bold t-text-sub mb-0.5">開始日</label>
            <input type="date" id="inline-task-start-${task.id}" value="${task.startDate || ''}" class="w-full p-1 t-card border rounded font-mono text-[10px] focus:outline-none focus:border-sky-500 cursor-pointer">
          </div>
          <div>
            <label class="block text-[10px] font-bold t-text-sub mb-0.5">目標日</label>
            <input type="date" id="inline-task-due-${task.id}" value="${task.dueDate || ''}" class="w-full p-1 t-card border rounded font-mono text-[10px] focus:outline-none focus:border-sky-500 cursor-pointer">
          </div>
          <div>
            <label class="block text-[10px] font-bold t-text-sub mb-0.5">工数(h)</label>
            <input type="number" id="inline-task-hours-${task.id}" min="0.5" max="1000" step="0.5" value="${task.hours !== undefined ? task.hours : 4}" class="w-full p-1 t-card border rounded font-mono font-bold text-[10px] focus:outline-none focus:border-sky-500">
          </div>
          <div>
            <label class="block text-[10px] font-bold t-text-sub mb-0.5">重要度</label>
            <select id="inline-task-priority-${task.id}" class="w-full p-1 t-card border rounded font-bold text-[10px] focus:outline-none focus:border-sky-500 cursor-pointer">
              <option value="高" ${task.priority === '高' ? 'selected' : ''}>高</option>
              <option value="中" ${task.priority === '中' ? 'selected' : ''}>中</option>
              <option value="低" ${task.priority === '低' ? 'selected' : ''}>低</option>
              <option value="未定" ${task.priority === '未定' || !task.priority ? 'selected' : ''}>未定</option>
            </select>
          </div>
        </div>

        <div>
          <label class="block text-[10px] font-bold t-text-sub mb-0.5">内容・ゴール</label>
          <input type="text" id="inline-task-desc-${task.id}" value="${escapeHtml(task.description || '')}" maxlength="120" class="w-full p-1.5 t-card border rounded-lg t-text-main focus:outline-none focus:border-sky-500">
        </div>

        <div class="p-2 rounded-xl bg-slate-500/10 border border-inherit space-y-1.5">
          <div class="flex items-center justify-between text-[11px]">
            <span class="font-bold t-text-main flex items-center gap-1">
              <i data-lucide="activity" class="w-3 h-3 text-sky-500"></i>
              進捗率: <strong id="inline-progress-label-${task.id}" class="font-mono text-sky-600 dark:text-sky-400 font-black">${currentPercent}%</strong>
            </span>
            <span class="text-[10px] t-text-muted font-bold">${hasChecklist ? '※助言チェックリスト連動中' : 'ワンタップ選択 (33%刻み)'}</span>
          </div>

          <div id="inline-preset-btns-${task.id}" class="grid grid-cols-4 gap-1 font-mono text-[10px] font-bold ${hasChecklist ? 'opacity-40 pointer-events-none' : ''}">
            <button type="button" onclick="setInlineTaskProgress('${task.id}', 0)" class="py-1 rounded-lg transition cursor-pointer ${currentPercent === 0 ? 'bg-sky-600 text-white font-black shadow-sm' : 't-card border t-text-muted hover:t-text-main'}">0% 未</button>
            <button type="button" onclick="setInlineTaskProgress('${task.id}', 33)" class="py-1 rounded-lg transition cursor-pointer ${currentPercent === 33 ? 'bg-sky-600 text-white font-black shadow-sm' : 't-card border text-sky-600 dark:text-sky-400'}">33% 初手</button>
            <button type="button" onclick="setInlineTaskProgress('${task.id}', 66)" class="py-1 rounded-lg transition cursor-pointer ${currentPercent === 66 ? 'bg-sky-600 text-white font-black shadow-sm' : 't-card border text-sky-600 dark:text-sky-400'}">66% 順調</button>
            <button type="button" onclick="setInlineTaskProgress('${task.id}', 100)" class="py-1 rounded-lg transition cursor-pointer ${currentPercent === 100 ? 'bg-emerald-600 text-white font-black shadow-sm' : 't-card border text-emerald-600 dark:text-emerald-400'}">100% 完</button>
          </div>
          <input type="hidden" id="inline-task-progress-val-${task.id}" value="${currentPercent}">

          <div>
            <label class="block text-[10px] font-bold t-text-sub mb-0.5">進捗メモ</label>
            <textarea id="inline-task-note-${task.id}" rows="2" placeholder="進捗メモ・連絡事項" class="w-full p-1.5 t-card border rounded-lg t-text-main font-mono text-[11px] focus:outline-none focus:border-sky-500 resize-none">${escapeHtml(task.progressNote || '')}</textarea>
          </div>
        </div>

        <div class="flex items-center justify-end gap-2 pt-1 border-t border-inherit">
          <button type="button" onclick="cancelInlineTaskEdit(event)" class="px-2.5 py-1 t-text-muted hover:t-text-main text-[11px] font-bold cursor-pointer">キャンセル</button>
          <button type="button" onclick="saveInlineTaskEdit('${task.id}', event)" class="px-3.5 py-1 btn-brand rounded-lg text-[11px] font-bold cursor-pointer">保存する</button>
        </div>
      </div>
    `;
    return card;
  }

  let dueBadgeHtml = '';
  if (!task.dueDate || task.dueDate === '') {
    dueBadgeHtml = `<button type="button" onclick="quickEditDueDate('${task.id}', event)" class="px-2 py-0.5 rounded text-[10px] font-mono font-black bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 flex items-center gap-1 shadow-sm transition active:scale-95 cursor-pointer" title="クリックして目標日を即設定">
      <i data-lucide="calendar-plus" class="w-3 h-3 text-amber-500"></i> 目標日未設定
    </button>`;
  } else {
    const diffDays = calculateDaysRemaining(task.dueDate);
    let diffLabel = diffDays === 0 ? '(本日)' : (diffDays > 0 ? `(あと${diffDays}日)` : `(${Math.abs(diffDays)}日超過)`);
    dueBadgeHtml = `<button type="button" onclick="quickEditDueDate('${task.id}', event)" class="px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
      diffDays < 0 ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400' : 'bg-slate-500/10 text-slate-800 dark:text-slate-200'
    } hover:border hover:border-sky-500/40 flex items-center gap-1 transition" title="クリックして目標日を変更">
      <i data-lucide="calendar" class="w-3 h-3 text-sky-500 dark:text-sky-400"></i> ${task.dueDate} ${diffLabel}
    </button>`;
  }

  let priorityClass = 'bg-slate-500/15 text-slate-700 dark:text-slate-300';
  if (task.priority === '高') priorityClass = 'bg-rose-500/20 text-rose-600 dark:text-rose-400 font-black';
  if (task.priority === '中') priorityClass = 'bg-sky-500/20 text-sky-700 dark:text-sky-300 font-bold';
  if (task.priority === '未定') priorityClass = 'bg-amber-500/25 text-amber-800 dark:text-amber-300 font-black';

  const checkItems = parseChecklistFromNote(task.progressNote || '');
  let checklistHtml = '';

  if (checkItems.length > 0) {
    const isExplicitOpen = window.taskAccordionOpenMap[task.id];
    const isOpen = isExplicitOpen !== undefined ? isExplicitOpen : isSelected;

    checklistHtml = `
      <div class="mt-2 pt-1.5 border-t border-inherit/40 text-[11px]" onclick="event.stopPropagation()">
        <div class="flex items-center justify-between py-0.5 mb-1 cursor-pointer select-none" onclick="toggleTaskChecklistAccordion('${task.id}', event)">
          <span class="text-[10px] font-mono font-bold text-sky-600 dark:text-sky-400 flex items-center gap-1">
            <i data-lucide="${isOpen ? 'chevron-down' : 'chevron-right'}" class="w-3 h-3 text-sky-500 dark:text-sky-400"></i>
            <span>実行アクション (${checkItems.filter(i => i.checked).length}/${checkItems.length})</span>
          </span>
          <span class="text-[9px] t-text-muted">${isOpen ? '折りたたむ' : '展開する'}</span>
        </div>

        <div class="${isOpen ? 'space-y-1' : 'hidden'} transition-all">
          ${checkItems.map((item, idx) => `
            <label class="checklist-item flex items-start gap-1.5 p-1 rounded cursor-pointer select-none">
              <input type="checkbox" ${item.checked ? 'checked' : ''} onchange="toggleTaskCheckItem('${task.id}', ${idx})" class="mt-0.5 rounded text-sky-600 focus:ring-0 cursor-pointer">
              <span class="${item.checked ? 'line-through text-slate-400 dark:text-slate-500 font-normal' : 't-text-main font-bold'} leading-tight">${escapeHtml(item.text)}</span>
            </label>
          `).join('')}
        </div>
      </div>
    `;
  }

  const hoursLabel = (task.hours !== undefined) ? `${task.hours}h` : '4h';

  card.innerHTML = `
    <div class="flex items-start justify-between gap-2">
      <div class="flex items-start gap-2 flex-1 min-w-0">
        <input type="checkbox" ${task.completed ? 'checked' : ''} onclick="event.stopPropagation(); toggleTaskComplete('${task.id}')" class="mt-1 w-4 h-4 rounded text-sky-600 focus:ring-0 cursor-pointer">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5 flex-wrap">
            <h4 class="font-black text-xs t-text-main leading-snug break-words ${task.completed ? 'line-through text-slate-400' : ''}">${escapeHtml(task.title)}</h4>
            <span class="text-[9px] px-1.5 py-0.2 rounded font-mono font-bold bg-slate-500/10 text-slate-700 dark:text-slate-300">${escapeHtml(task.category || '未設定')}</span>
          </div>
          <p class="text-[11px] t-text-sub mt-0.5 line-clamp-2 leading-relaxed font-medium">${escapeHtml(task.description || '')}</p>
        </div>
      </div>
      <div class="flex items-center gap-1 shrink-0">
        <button onclick="toggleInlineEditTask('${task.id}', event)" class="p-1 rounded hover:bg-slate-500/15 t-text-muted hover:t-text-main transition" title="その場で直接編集">
          <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
        </button>
        <button onclick="event.stopPropagation(); deleteTask('${task.id}')" class="p-1 rounded hover:bg-rose-500/15 t-text-muted hover:text-rose-500 transition" title="削除">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    </div>

    <div class="mt-2 flex items-center justify-between text-[10px] gap-2">
      <div class="flex items-center gap-1.5 flex-wrap">
        ${dueBadgeHtml}
        <span class="px-1.5 py-0.2 rounded font-mono ${priorityClass}">${escapeHtml(task.priority || '未定')}</span>
        <span class="px-1.5 py-0.2 rounded font-mono font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300" title="想定工数">${hoursLabel}</span>
      </div>
      <span class="font-mono font-black text-sky-600 dark:text-sky-400 text-[11px]">${task.progressPercent || 0}%</span>
    </div>

    <div class="mt-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
      <div class="bg-gradient-to-r from-sky-500 to-emerald-500 h-1.5 rounded-full transition-all duration-300" style="width: ${task.progressPercent || 0}%"></div>
    </div>

    ${checklistHtml}
  `;

  return card;
}

function toggleInlineEditTask(taskId, event) {
  if (event) event.stopPropagation();
  window.inlineEditingThemeId = null;
  window.inlineEditingTaskId = (window.inlineEditingTaskId === taskId) ? null : taskId;
  renderTasks();
  if (window.lucide) lucide.createIcons();
}

function cancelInlineTaskEdit(event) {
  if (event) event.stopPropagation();
  window.inlineEditingTaskId = null;
  renderTasks();
  if (window.lucide) lucide.createIcons();
}

function setInlineTaskProgress(taskId, percent) {
  const valInput = document.getElementById(`inline-task-progress-val-${taskId}`);
  const label = document.getElementById(`inline-progress-label-${taskId}`);
  if (valInput) valInput.value = percent;
  if (label) label.textContent = `${percent}%`;

  const presetContainer = document.getElementById(`inline-preset-btns-${taskId}`);
  if (presetContainer) {
    const buttons = presetContainer.querySelectorAll('button');
    const values = [0, 33, 66, 100];
    buttons.forEach((btn, idx) => {
      const val = values[idx];
      if (val === percent) {
        btn.className = `py-1 rounded-lg transition cursor-pointer ${val === 100 ? 'bg-emerald-600 text-white font-black shadow-sm' : 'bg-sky-600 text-white font-black shadow-sm'}`;
      } else {
        btn.className = `py-1 rounded-lg transition cursor-pointer t-card border ${val === 100 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400 hover:t-text-main'}`;
      }
    });
  }
}

function saveInlineTaskEdit(taskId, event) {
  if (event) event.stopPropagation();
  const task = window.cockpitTasks.find(t => t.id === taskId);
  if (!task) return;

  const titleInput = document.getElementById(`inline-task-title-${taskId}`);
  const catInput = document.getElementById(`inline-task-category-${taskId}`);
  const startInput = document.getElementById(`inline-task-start-${taskId}`);
  const dueInput = document.getElementById(`inline-task-due-${taskId}`);
  const hoursInput = document.getElementById(`inline-task-hours-${taskId}`);
  const priorityInput = document.getElementById(`inline-task-priority-${taskId}`);
  const descInput = document.getElementById(`inline-task-desc-${taskId}`);
  const noteInput = document.getElementById(`inline-task-note-${taskId}`);
  const progressValInput = document.getElementById(`inline-task-progress-val-${taskId}`);

  if (titleInput && titleInput.value.trim()) {
    task.title = titleInput.value.trim();
  }
  if (catInput) task.category = catInput.value.trim() || '一般';
  if (startInput) task.startDate = startInput.value;
  if (dueInput) task.dueDate = dueInput.value;
  if (hoursInput) task.hours = parseFloat(hoursInput.value) || 4;
  if (priorityInput) task.priority = priorityInput.value;
  if (descInput) task.description = descInput.value.trim();
  if (noteInput) task.progressNote = noteInput.value;

  const checkItems = parseChecklistFromNote(task.progressNote);
  if (checkItems.length > 0) {
    const checkedCount = checkItems.filter(i => i.checked).length;
    task.progressPercent = Math.round((checkedCount / checkItems.length) * 100);
  } else if (progressValInput) {
    task.progressPercent = Number(progressValInput.value) || 0;
  }

  task.completed = task.progressPercent === 100;
  task.needsAttention = !task.dueDate || task.priority === '未定';

  window.inlineEditingTaskId = null;
  saveDataToLocalStorage();
  renderTasks();
  renderCenterPane();
  updateGuidanceBanner('✨ アクション更新完了', `「${task.title}」を保存しました。進捗バー: ${task.progressPercent}%`, false, '* 目標日や想定工数がガントチャートにも即時反映されます。');
  if (window.lucide) lucide.createIcons();
}

function toggleTaskChecklistAccordion(taskId, event) {
  if (event) event.stopPropagation();
  const current = window.taskAccordionOpenMap[taskId];
  const isSelected = window.selectedTaskId === taskId;
  const currentOpen = current !== undefined ? current : isSelected;
  window.taskAccordionOpenMap[taskId] = !currentOpen;
  renderTasks();
  if (window.lucide) lucide.createIcons();
}

function quickEditDueDate(taskId, event) {
  if (event) event.stopPropagation();
  window.inlineEditingTaskId = taskId;
  renderTasks();
  setTimeout(() => {
    const dueInput = document.getElementById(`inline-task-due-${taskId}`);
    if (dueInput) {
      dueInput.focus();
      if (typeof dueInput.showPicker === 'function') {
        try { dueInput.showPicker(); } catch (e) {}
      }
    }
  }, 100);
  if (window.lucide) lucide.createIcons();
}

function renderStockIdeas() {
  const container = document.getElementById('ideas-stock-container');
  if (!container) return;
  container.innerHTML = '';

  const sessions = window.cockpitSessions || [];
  const tasks = window.cockpitTasks || [];
  const actionThemeIds = new Set(tasks.map(t => t.themeId).filter(Boolean));

  let count = 0;
  sessions.forEach(sess => {
    (sess.themes || []).forEach(th => {
      if (!actionThemeIds.has(th.id) || th.isIdeaStock === true) {
        count++;
        const isSelected = window.selectedThemeId === th.id;
        const card = document.createElement('div');
        card.className = `p-3 rounded-xl border transition-all cursor-pointer interactive-card ${
          isSelected ? 'spotlight-active' : 't-card hover:border-indigo-500/40'
        }`;
        card.onclick = () => {
          window.selectedSessionId = sess.id;
          window.selectedThemeId = th.id;
          window.selectedTaskId = null;
          window.inputTargetMode = 'reconstruct';
          updateGuidanceBanner('💡 温め中の構想', `構想「${th.theme}」を閲覧中。「昇格」でアクション化、追加発話で再構成できます。`, false, '* 右ペインでアイデアを話すと「🔄 構想を再構成」でガラガラポンできます。');
          renderStockIdeas();
          renderCenterPane();
          updateRightPaneButtons();
          if (window.lucide) lucide.createIcons();
        };

        card.innerHTML = `
          <div class="flex items-start justify-between gap-2">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5 flex-wrap">
                <h4 class="font-black text-xs t-text-main truncate">${escapeHtml(th.theme)}</h4>
                <span class="text-[9px] px-1.5 py-0.2 rounded font-mono font-bold bg-indigo-500/15 text-indigo-700 dark:text-indigo-300">${escapeHtml(th.category || '一般')}</span>
              </div>
              <p class="text-[11px] t-text-sub mt-1 line-clamp-2 leading-relaxed font-medium">${escapeHtml(th.content || '')}</p>
            </div>
            <button onclick="event.stopPropagation(); promoteThemeToTask('${th.id}')" class="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-black text-[10px] flex items-center gap-1 shadow-sm transition active:scale-95 shrink-0" title="左のアクション一覧へ昇格">
              <i data-lucide="rocket" class="w-3 h-3"></i> 昇格
            </button>
          </div>
          <div class="mt-2 pt-1 border-t border-inherit/40 flex items-center justify-between text-[10px] t-text-muted">
            <span class="flex items-center gap-1"><i data-lucide="clock" class="w-2.5 h-2.5 text-sky-500 dark:text-sky-400"></i> ${escapeHtml(sess.timestamp || '')}</span>
            <span class="text-indigo-600 dark:text-indigo-400 font-bold">温め棚保管中</span>
          </div>
        `;
        container.appendChild(card);
      }
    });
  });

  if (count === 0) {
    container.innerHTML = '<div class="text-center py-8 t-text-muted text-xs font-bold">温め中の構想はありません。右ペインから「💡 構想ストック」してください。</div>';
  }
}

function toggleCompletedSection() {
  const container = document.getElementById('tasks-completed-container');
  const icon = document.getElementById('icon-toggle-completed');
  if (container) {
    const isHidden = container.classList.contains('hidden');
    if (isHidden) {
      container.classList.remove('hidden');
      if (icon) icon.classList.add('rotate-180');
    } else {
      container.classList.add('hidden');
      if (icon) icon.classList.remove('rotate-180');
    }
  }
}

// ==========================================
// 7. タスク操作（CRUD ＆ 昇格）
// ==========================================

function toggleTaskComplete(taskId) {
  const task = window.cockpitTasks.find(t => t.id === taskId);
  if (!task) return;
  task.completed = !task.completed;
  if (task.completed) {
    task.progressPercent = 100;
  }
  saveDataToLocalStorage();
  renderTasks();
  if (window.lucide) lucide.createIcons();
}

function deleteTask(taskId) {
  const task = window.cockpitTasks.find(t => t.id === taskId);
  if (!task) return;
  if (confirm(`やりたいこと「${task.title}」を削除してもよろしいですか？`)) {
    window.cockpitTasks = window.cockpitTasks.filter(t => t.id !== taskId);
    if (window.selectedTaskId === taskId) {
      window.selectedTaskId = null;
    }
    saveDataToLocalStorage();
    renderTasks();
    renderCenterPane();
    if (window.lucide) lucide.createIcons();
  }
}

function promoteThemeToTask(themeId) {
  let foundTheme = null;
  let foundSession = null;
  (window.cockpitSessions || []).forEach(sess => {
    (sess.themes || []).forEach(th => {
      if (th.id === themeId) {
        foundTheme = th;
        foundSession = sess;
      }
    });
  });

  if (!foundTheme) return;

  const todayStr = formatTodayStr();
  const taskTitle = foundTheme.actionTitle || foundTheme.theme;
  const taskDesc = foundTheme.actionGoal || (foundTheme.content ? foundTheme.content.substring(0, 120) : '');

  const newTask = {
    id: 't_' + Date.now(),
    sessionId: foundSession?.id || null,
    themeId: foundTheme.id,
    category: foundTheme.category || '一般',
    title: taskTitle,
    description: taskDesc,
    startDate: todayStr,
    dueDate: '',
    hours: 4,
    actualHours: 0,
    priority: '未定',
    progressPercent: 0,
    progressNote: '',
    completed: false,
    needsAttention: true,
    createdAt: Date.now()
  };

  window.cockpitTasks.unshift(newTask);
  foundTheme.isIdeaStock = false;

  saveDataToLocalStorage();
  switchLeftPaneView('actions');
  selectTask(newTask.id);
  updateGuidanceBanner('🚀 アクションへ昇格！', `「${newTask.title}」をアクションへ昇格しました。「目標日未設定」を押して目標日を決めましょう。`, true, '* ガントチャート側にも自動的に同期されます。');
}

// ==========================================
// 8. 中央ペイン：Why/What/How 表示
// ==========================================

function selectTask(taskId, shouldScroll = false) {
  window.selectedTaskId = taskId;
  window.taskAccordionOpenMap = {};
  
  const task = window.cockpitTasks.find(t => t.id === taskId);
  if (!task) return;

  window.selectedSessionId = task.sessionId;
  window.selectedThemeId = task.themeId;
  window.inputTargetMode = 'new';

  if (isTaskAttention(task)) {
    updateGuidanceBanner('⚠️ 仕込み中アクション', `「${task.title}」の目標日や重要度が未設定です。鉛筆マークから確定してください。`, true, '* 目標日を設定するとGoogleカレンダー・ガントチャートと連携可能になります。');
  } else {
    updateGuidanceBanner('🚀 実行アクション選択中', `「${task.title}」を展開中。中央の「メモへ取込」で初手をチェックリスト化できます。`, false, `* 目標日: ${task.dueDate || '未設定'} / 想定工数: ${task.hours || 4}h / 進捗: ${task.progressPercent || 0}%`);
  }

  renderTasks();
  renderCenterPane();
  updateRightPaneButtons();

  if (shouldScroll) {
    setTimeout(() => {
      const cardEl = document.getElementById(`task-card-${taskId}`);
      if (cardEl) {
        cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 100);
  }

  if (window.lucide) lucide.createIcons();
}

function selectTheme(themeId) {
  window.selectedThemeId = themeId;
  const session = window.cockpitSessions.find(s => s.id === window.selectedSessionId);
  const theme = session?.themes?.find(th => th.id === themeId);
  if (theme) {
    updateGuidanceBanner('💡 実現論点選択中', `論点「${theme.theme}」の助言を確認中。「メモへ取込」で初手を実行に移せます。`, false, '* 鉛筆マークを押すと、その場で論点を直接修正できます。');
  }
  renderCenterPane();
  updateRightPaneButtons();
  if (window.lucide) lucide.createIcons();
}

function clearSelection() {
  window.selectedTaskId = null;
  window.selectedSessionId = null;
  window.selectedThemeId = null;
  window.inlineEditingTaskId = null;
  window.inlineEditingThemeId = null;
  window.inputTargetMode = 'new';
  window.taskAccordionOpenMap = {};
  renderTasks();
  renderCenterPane();
  updateRightPaneButtons();
  updateGuidanceBanner('🧭 待機中', '左ペインでアクションまたは構想を選択するか、右ペインのマイクで新しいアイデアを話してください。', false, '* 初手を実行したら「メモへ取込」を押してチェックリスト化しましょう。');
  if (window.lucide) lucide.createIcons();
}

function startRecordingFromWelcome() {
  window.inputTargetMode = 'new';
  updateRightPaneButtons();
  document.getElementById('input-text')?.focus();
  document.getElementById('btn-toggle-mic')?.click();
}

function selectFirstTask() {
  switchLeftPaneView('actions');

  let activeTasks = (window.cockpitTasks || []).filter(t => !t.completed);
  if (activeTasks.length === 0) {
    openAddTaskModal();
    return;
  }

  sortTaskList(activeTasks);
  const targetTask = activeTasks.find(t => t.dueDate && t.dueDate.trim() !== '') || activeTasks[0];

  if (targetTask) {
    selectTask(targetTask.id, true);
  }
}

function renderCenterPane() {
  const welcomePanel = document.getElementById('center-welcome-panel');
  const contentWrapper = document.getElementById('center-content-wrapper');

  if (!window.selectedSessionId && !window.selectedTaskId) {
    if (welcomePanel) welcomePanel.classList.remove('hidden');
    if (contentWrapper) contentWrapper.classList.add('hidden');
    return;
  }

  if (welcomePanel) welcomePanel.classList.add('hidden');
  if (contentWrapper) contentWrapper.classList.remove('hidden');

  const session = window.cockpitSessions.find(s => s.id === window.selectedSessionId);
  if (!session) return;

  const contextEl = document.getElementById('context-content');
  const timestampEl = document.getElementById('session-timestamp-label');
  const expandBtn = document.getElementById('btn-toggle-why-expand');

  if (contextEl) {
    const rawContext = session.context || '思考背景がありません';
    contextEl.textContent = rawContext;
    if (window.isWhyExpanded) {
      contextEl.classList.remove('line-clamp-2');
      if (expandBtn) expandBtn.textContent = '▲ 折りたたむ';
    } else {
      contextEl.classList.add('line-clamp-2');
      if (expandBtn) expandBtn.textContent = '▼ もっと見る';
    }

    if (expandBtn) {
      if (rawContext.length > 55 || rawContext.includes('\n')) {
        expandBtn.classList.remove('hidden');
      } else {
        expandBtn.classList.add('hidden');
      }
    }
  }

  if (timestampEl) timestampEl.textContent = session.timestamp || '--:--';

  renderThemesSection(session);
  renderAdviceSection();
}

function toggleWhyExpand(event) {
  if (event) event.stopPropagation();
  window.isWhyExpanded = !window.isWhyExpanded;
  renderCenterPane();
}

function renderThemesSection(session) {
  const themesTabBar = document.getElementById('themes-tab-bar');
  const themesContainer = document.getElementById('themes-container');
  const countThemesEl = document.getElementById('count-themes');

  const themes = session.themes || [];
  if (countThemesEl) countThemesEl.textContent = `${themes.length}件`;

  if (!window.selectedThemeId && themes.length > 0) {
    window.selectedThemeId = themes[0].id;
  }

  if (themesTabBar) {
    if (themes.length > 1) {
      themesTabBar.classList.remove('hidden');
      themesTabBar.innerHTML = themes.map(th => {
        const isSelected = th.id === window.selectedThemeId;
        return `
          <button type="button" onclick="selectTheme('${th.id}')" class="px-3.5 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 shrink-0 ${
            isSelected
              ? 'bg-sky-600 text-white font-black shadow-sm'
              : 't-card border text-slate-600 dark:text-slate-400 hover:t-text-main'
          }">
            <span class="truncate max-w-[150px]">${escapeHtml(th.theme)}</span>
          </button>
        `;
      }).join('');
    } else {
      themesTabBar.classList.add('hidden');
      themesTabBar.innerHTML = '';
    }
  }

  if (themesContainer) {
    themesContainer.innerHTML = '';
    const currentTheme = themes.find(th => th.id === window.selectedThemeId) || themes[0];
    if (!currentTheme) return;

    const isEditing = window.inlineEditingThemeId === currentTheme.id;

    if (isEditing) {
      const editDiv = document.createElement('div');
      editDiv.className = 'p-2.5 rounded-xl border border-sky-500/40 bg-sky-500/5 space-y-2 text-xs min-w-0';
      editDiv.innerHTML = `
        <div class="flex items-center justify-between pb-1 border-b border-inherit text-sky-600 dark:text-sky-400 font-bold text-[11px]">
          <span class="flex items-center gap-1"><i data-lucide="edit-3" class="w-3 h-3"></i> 論点の直接編集</span>
          <button type="button" onclick="cancelInlineThemeEdit(event)" class="t-text-muted hover:t-text-main"><i data-lucide="x" class="w-3 h-3"></i></button>
        </div>
        
        <div class="grid grid-cols-[3fr_2fr] gap-2">
          <div>
            <label class="block font-bold text-[10px] t-text-sub mb-0.5">テーマ名 (全角24文字目安)</label>
            <input type="text" id="inline-theme-title-${currentTheme.id}" value="${escapeHtml(currentTheme.theme)}" class="w-full p-1.5 t-card border rounded-lg t-text-main font-bold focus:outline-none focus:border-sky-500">
          </div>
          <div>
            <label class="block font-bold text-[10px] t-text-sub mb-0.5">区分</label>
            <input type="text" id="inline-theme-category-${currentTheme.id}" value="${escapeHtml(currentTheme.category || '')}" list="category-datalist" class="w-full p-1.5 t-card border rounded-lg t-text-main font-medium focus:outline-none focus:border-sky-500">
          </div>
        </div>

        <div>
          <label class="block font-bold text-[10px] t-text-sub mb-0.5">具体論点・要約 (100〜150文字目安)</label>
          <textarea id="inline-theme-content-${currentTheme.id}" rows="2" class="w-full p-1.5 t-card border rounded-lg t-text-main focus:outline-none focus:border-sky-500 resize-none font-medium">${escapeHtml(currentTheme.content || '')}</textarea>
        </div>
        <div class="flex justify-end gap-2 pt-1 border-t border-inherit">
          <button type="button" onclick="cancelInlineThemeEdit(event)" class="px-2.5 py-1 t-text-muted hover:t-text-main text-[11px] font-bold cursor-pointer">キャンセル</button>
          <button type="button" onclick="saveInlineThemeEdit('${currentTheme.id}', event)" class="px-3.5 py-1 btn-brand rounded-lg text-[11px] font-bold cursor-pointer">保存する</button>
        </div>
      `;
      themesContainer.appendChild(editDiv);
    } else {
      const linkedTask = window.cockpitTasks.find(t => t.themeId === currentTheme.id);
      const card = document.createElement('div');
      card.className = 'p-2.5 rounded-xl border t-card spotlight-active transition-all min-w-0';
      card.innerHTML = `
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5 flex-wrap">
              <h4 class="font-black text-xs t-text-main truncate">${escapeHtml(currentTheme.theme)}</h4>
              <span class="text-[9px] px-1.5 py-0.2 rounded font-mono font-bold bg-sky-500/15 text-sky-700 dark:text-sky-300">${escapeHtml(currentTheme.category || '一般')}</span>
            </div>
            <p class="text-[11px] t-text-sub mt-1 line-clamp-2 leading-relaxed font-medium break-words">${escapeHtml(currentTheme.content || '')}</p>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            ${!linkedTask ? `
              <button onclick="event.stopPropagation(); promoteThemeToTask('${currentTheme.id}')" class="px-2 py-0.5 rounded-md bg-sky-600 hover:bg-sky-700 text-white font-black text-[10px] flex items-center gap-1 shadow-sm transition active:scale-95" title="アクション一覧へ昇格">
                <i data-lucide="rocket" class="w-3 h-3"></i> 昇格
              </button>
            ` : `
              <span class="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20">進行中</span>
            `}
            <button onclick="toggleInlineEditTheme('${currentTheme.id}', event)" class="p-1 t-text-muted hover:t-text-main transition" title="論点をその場で編集"><i data-lucide="edit-2" class="w-3 h-3"></i></button>
          </div>
        </div>
      `;
      themesContainer.appendChild(card);
    }
  }
}

function toggleInlineEditTheme(themeId, event) {
  if (event) event.stopPropagation();
  window.inlineEditingTaskId = null;
  window.inlineEditingThemeId = (window.inlineEditingThemeId === themeId) ? null : themeId;
  const session = window.cockpitSessions.find(s => s.id === window.selectedSessionId);
  if (session) renderThemesSection(session);
  if (window.lucide) lucide.createIcons();
}

function cancelInlineThemeEdit(event) {
  if (event) event.stopPropagation();
  window.inlineEditingThemeId = null;
  const session = window.cockpitSessions.find(s => s.id === window.selectedSessionId);
  if (session) renderThemesSection(session);
  if (window.lucide) lucide.createIcons();
}

function saveInlineThemeEdit(themeId, event) {
  if (event) event.stopPropagation();
  const session = window.cockpitSessions.find(s => s.id === window.selectedSessionId);
  const theme = session?.themes?.find(th => th.id === themeId);
  if (!theme) return;

  const titleInput = document.getElementById(`inline-theme-title-${themeId}`);
  const catInput = document.getElementById(`inline-theme-category-${themeId}`);
  const contentInput = document.getElementById(`inline-theme-content-${themeId}`);

  if (titleInput && titleInput.value.trim()) theme.theme = titleInput.value.trim();
  if (catInput) theme.category = catInput.value.trim() || '一般';
  if (contentInput) theme.content = contentInput.value.trim();

  window.inlineEditingThemeId = null;
  saveDataToLocalStorage();
  renderCenterPane();
  renderTasks();
  updateGuidanceBanner('✨ 論点更新完了', `論点「${theme.theme}」を保存しました。`, false);
  if (window.lucide) lucide.createIcons();
}

function renderAdviceSection() {
  const session = window.cockpitSessions.find(s => s.id === window.selectedSessionId);
  const theme = session?.themes?.find(th => th.id === window.selectedThemeId) || session?.themes?.[0];

  const adviceSection = document.getElementById('section-ai-advice');
  const titleEl = document.getElementById('advice-theme-title');
  const quickEl = document.getElementById('advice-quick-content');
  const stepsContainer = document.getElementById('advice-steps-content');
  const pitfallEl = document.getElementById('advice-pitfall-content');
  const importBtnLabel = document.getElementById('label-import-memo');
  const importBtnIcon = document.getElementById('icon-import-memo');

  if (!theme || !theme.advices) {
    if (titleEl) titleEl.textContent = '未選択';
    if (quickEl) quickEl.textContent = '論点を選択すると、具体的な初手が表示されます。';
    if (stepsContainer) stepsContainer.innerHTML = '';
    if (pitfallEl) pitfallEl.textContent = '';
    return;
  }

  if (titleEl) titleEl.textContent = theme.theme;
  if (quickEl) quickEl.textContent = theme.advices.quick || '初手が設定されていません';

  if (stepsContainer) {
    stepsContainer.innerHTML = '';
    (theme.advices.steps || []).forEach(step => {
      const p = document.createElement('p');
      p.className = 'text-xs t-text-main font-medium leading-relaxed break-words';
      p.textContent = step;
      stepsContainer.appendChild(p);
    });
  }

  if (pitfallEl) {
    pitfallEl.textContent = theme.advices.pitfall || '特に大きな落とし穴はありません。自分のペースで着手してください。';
  }

  let linkedTask = window.cockpitTasks.find(t => t.id === window.selectedTaskId);
  if (!linkedTask && theme) {
    linkedTask = window.cockpitTasks.find(t => t.themeId === theme.id);
  }

  const isAlreadyImported = linkedTask && linkedTask.progressNote && linkedTask.progressNote.trim().length > 0;

  if (adviceSection) {
    if (isAlreadyImported) {
      adviceSection.classList.add('advice-imported-settled');
      if (importBtnLabel) importBtnLabel.textContent = '✅ 取込済';
      if (importBtnIcon) importBtnIcon.setAttribute('data-lucide', 'check');
    } else {
      adviceSection.classList.remove('advice-imported-settled');
      if (importBtnLabel) importBtnLabel.textContent = 'メモへ取込';
      if (importBtnIcon) importBtnIcon.setAttribute('data-lucide', 'download');
    }
  }

  const linkedLabel = document.getElementById('advice-linked-task-label');
  if (linkedLabel) {
    linkedLabel.textContent = linkedTask ? `連動: ${linkedTask.title}` : '未タスク化';
  }
}

function handleEditAdviceButtonClick() {
  toggleInlineEditAdvice();
}

function toggleInlineEditAdvice(show) {
  const box = document.getElementById('advice-inline-edit-box');
  const scrollArea = document.getElementById('advice-scroll-body');
  const session = window.cockpitSessions.find(s => s.id === window.selectedSessionId);
  const theme = session?.themes?.find(th => th.id === window.selectedThemeId);
  if (!box || !theme || !theme.advices) return;

  const isHidden = box.classList.contains('hidden');
  const willShow = show !== undefined ? show : isHidden;

  if (willShow) {
    document.getElementById('inline-advice-quick').value = theme.advices.quick || '';
    document.getElementById('inline-advice-steps').value = (theme.advices.steps || []).join('\n');
    document.getElementById('inline-advice-pitfall').value = theme.advices.pitfall || '';

    box.classList.remove('hidden');
    if (scrollArea) scrollArea.classList.add('hidden');
  } else {
    box.classList.add('hidden');
    if (scrollArea) scrollArea.classList.remove('hidden');
  }
  if (window.lucide) lucide.createIcons();
}

function cancelInlineAdviceEdit() {
  toggleInlineEditAdvice(false);
}

function saveInlineAdviceEdit() {
  const session = window.cockpitSessions.find(s => s.id === window.selectedSessionId);
  const theme = session?.themes?.find(th => th.id === window.selectedThemeId);
  if (theme && theme.advices) {
    theme.advices.quick = document.getElementById('inline-advice-quick')?.value.trim() || '';
    const stepsText = document.getElementById('inline-advice-steps')?.value.trim() || '';
    theme.advices.steps = stepsText ? stepsText.split('\n').filter(Boolean) : [];
    theme.advices.pitfall = document.getElementById('inline-advice-pitfall')?.value.trim() || '';

    saveDataToLocalStorage();
    renderAdviceSection();
    updateGuidanceBanner('✨ 助言更新完了', 'AI実行助言を手動更新しました。納得したら「メモへ取込」を押してください。', false);
  }
  toggleInlineEditAdvice(false);
}

function toggleEditContext(show) {
  const displayP = document.getElementById('context-content');
  const expandBtn = document.getElementById('btn-toggle-why-expand');
  const editContainer = document.getElementById('context-edit-container');
  const textarea = document.getElementById('context-edit-textarea');
  const session = window.cockpitSessions.find(s => s.id === window.selectedSessionId);

  const willShow = show !== undefined ? show : editContainer?.classList.contains('hidden');
  if (willShow && session) {
    if (displayP) displayP.classList.add('hidden');
    if (expandBtn) expandBtn.classList.add('hidden');
    if (editContainer) editContainer.classList.remove('hidden');
    if (textarea) textarea.value = session.context || '';
  } else {
    if (displayP) displayP.classList.remove('hidden');
    if (editContainer) editContainer.classList.add('hidden');
    renderCenterPane();
  }
}

function saveContextEdit() {
  const session = window.cockpitSessions.find(s => s.id === window.selectedSessionId);
  const textarea = document.getElementById('context-edit-textarea');
  if (session && textarea) {
    session.context = textarea.value.trim();
    saveDataToLocalStorage();
    renderCenterPane();
    updateGuidanceBanner('✨ 思考背景を保存しました', '発想の原点(Why)が更新されました。', false);
  }
  toggleEditContext(false);
}

function deleteCurrentSession() {
  if (!window.selectedSessionId) return;
  if (confirm('この構想セッション全体を削除してもよろしいですか？')) {
    window.cockpitSessions = window.cockpitSessions.filter(s => s.id !== window.selectedSessionId);
    clearSelection();
    saveDataToLocalStorage();
    renderTasks();
  }
}

// ==========================================
// 9. 助言ツッコミ ＆ 外部Geminiプロンプトコピー ＆ 3.8深考
// ==========================================

function handleCommentButtonClick() {
  toggleCommentBox();
}

function toggleCommentBox(show) {
  const box = document.getElementById('comment-box-wrapper');
  if (!box) return;
  const isHidden = box.classList.contains('hidden');
  const willShow = show !== undefined ? show : isHidden;
  if (willShow) {
    box.classList.remove('hidden');
    document.getElementById('comment-input-text')?.focus();
    renderCommentHistory();
  } else {
    if (isCommentRecording && commentRecognition) {
      commentRecognition.stop();
    }
    box.classList.add('hidden');
  }
}

function toggleCommentSpeech() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert('音声認識がサポートされていません。テキストで入力してください。');
    return;
  }

  if (isCommentRecording) {
    commentRecognition?.stop();
    return;
  }

  commentRecognition = new SpeechRecognition();
  commentRecognition.lang = 'ja-JP';
  commentRecognition.interimResults = true;
  commentRecognition.continuous = true;

  const micBtn = document.getElementById('btn-comment-mic');
  const inputEl = document.getElementById('comment-input-text');
  const wrapper = document.getElementById('comment-box-wrapper');
  const indicator = document.getElementById('comment-mic-indicator');

  currentCommentRawTranscript = inputEl?.value || '';

  commentRecognition.onstart = () => {
    isCommentRecording = true;
    if (micBtn) micBtn.classList.add('recording-active', 'bg-rose-600', 'text-white');
    if (indicator) indicator.classList.remove('hidden');
    if (wrapper) wrapper.classList.add('recording-glow-frame');
    if (inputEl) inputEl.classList.add('recording-glow-frame');
    updateGuidanceBanner('🎙️ ツッコミ音声入力中', '追加の条件や要望を声でお話しください。話し終わったら再度マイクを押して停止します。', true);
  };

  commentRecognition.onresult = (event) => {
    let interim = '';
    let final = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) final += event.results[i][0].transcript;
      else interim += event.results[i][0].transcript;
    }
    if (inputEl) {
      if (final) {
        currentCommentRawTranscript += (currentCommentRawTranscript ? ' ' : '') + final;
        inputEl.value = currentCommentRawTranscript;
      } else if (interim) {
        inputEl.value = currentCommentRawTranscript + ' ' + interim;
      }
    }
  };

  commentRecognition.onerror = () => {
    isCommentRecording = false;
    updateCommentMicUI(false);
  };

  commentRecognition.onend = () => {
    isCommentRecording = false;
    updateCommentMicUI(false);
    updateGuidanceBanner('✨ ツッコミ録音完了', '条件を確認し、「✨ スッキリ推敲」で整えてから「再考」を押すとAIが手順を再構築します。', false, '* 複数行にわたるツッコミもそのまま反映できます。');
  };

  commentRecognition.start();
}

function updateCommentMicUI(recording) {
  const micBtn = document.getElementById('btn-comment-mic');
  const wrapper = document.getElementById('comment-box-wrapper');
  const inputEl = document.getElementById('comment-input-text');
  const indicator = document.getElementById('comment-mic-indicator');

  if (recording) {
    if (micBtn) micBtn.classList.add('recording-active', 'bg-rose-600', 'text-white');
    if (indicator) indicator.classList.remove('hidden');
    if (wrapper) wrapper.classList.add('recording-glow-frame');
    if (inputEl) inputEl.classList.add('recording-glow-frame');
  } else {
    if (micBtn) micBtn.classList.remove('recording-active', 'bg-rose-600', 'text-white');
    if (indicator) indicator.classList.add('hidden');
    if (wrapper) wrapper.classList.remove('recording-glow-frame');
    if (inputEl) inputEl.classList.remove('recording-glow-frame');
  }
}

async function polishCommentTextWithAI() {
  const inputEl = document.getElementById('comment-input-text');
  const text = inputEl?.value?.trim();
  if (!text) {
    alert('推敲するツッコミテキストがありません。話すか入力してください。');
    return;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    alert('Gemini APIキーを設定してください。');
    openSettingsModal();
    return;
  }

  updateGuidanceBanner('✨ ツッコミをスッキリ推敲中...', '情報量を維持したまま、文脈と句読点を整えています。', true);

  const prompt = `あなたは文字起こし校正のプロフェッショナルです。
助言に対するユーザーのツッコミ（追加の要望・条件・意見）のテキストが入力されました。
ユーザーの言いたいこと、要求事項、ニュアンス、情報量を100%保ったまま、
句点（。）を打ち、言い淀みやフィラー（えーと、あの等）を排除した自然で明確な日本語に整形してください。
※前置きや挨拶は一切含めず、整形後のテキストのみを出力してください。

【ツッコミ内容】
${text}`;

  try {
    const polished = await callGeminiWithStepwiseTimeout(prompt, apiKey, false);
    inputEl.value = polished.trim();
    currentCommentRawTranscript = inputEl.value;
    updateGuidanceBanner('💡 ツッコミ推敲完了', 'ツッコミを綺麗に整えました。「再考」を押すと手順を再構築します。', false);
  } catch (e) {
    alert('ツッコミ推敲失敗: ' + e.message);
  }
}

async function submitAdviceComment() {
  const inputEl = document.getElementById('comment-input-text');
  const comment = inputEl?.value?.trim();
  if (!comment) return;

  const session = window.cockpitSessions.find(s => s.id === window.selectedSessionId);
  const theme = session?.themes?.find(th => th.id === window.selectedThemeId);
  if (!theme) return;

  const apiKey = getApiKey();
  if (!apiKey) {
    alert('Gemini APIキーを設定してください。');
    openSettingsModal();
    return;
  }

  updateGuidanceBanner('💬 助言を再構築中...', `ツッコミ「${comment}」を踏まえて手順を再考しています。`, true);

  const prompt = `あなたはパーソナルコックピットの参謀AIです。
以下の論点と既存の助言に対して、ユーザーからツッコミ（要望・条件追加）が入りました。
ユーザーのツッコミを最優先で反映し、新しい初手(quick)・続きのステップ(steps)・落とし穴(pitfall)をJSONで再出力してください。

【論点】${theme.theme} (${theme.content})
【既存の初手】${theme.advices?.quick || ''}
【ユーザーからのツッコミ】${comment}

【出力形式】
{
  "quick": "ツッコミを反映した最初の5分アクション",
  "steps": ["第2手: 〜〜", "第3手: 〜〜"],
  "pitfall": "〜〜に注意。"
}`;

  try {
    const res = await callGeminiWithStepwiseTimeout(prompt, apiKey, false);
    const parsed = cleanAndParseJson(res);

    theme.advices.quick = parsed.quick;
    theme.advices.steps = parsed.steps;
    theme.advices.pitfall = parsed.pitfall;

    currentCommentHistory.push({ time: new Date().toLocaleTimeString(), comment });
    inputEl.value = '';
    currentCommentRawTranscript = '';
    renderCommentHistory();
    renderAdviceSection();
    saveDataToLocalStorage();
    updateGuidanceBanner('✨ 助言更新完了', 'ツッコミを反映して初手とステップを更新しました。', false, '* 納得したら「メモへ取込」を押してください。');
  } catch (e) {
    alert('ツッコミ再考エラー: ' + e.message);
  }
}

function renderCommentHistory() {
  const listEl = document.getElementById('comment-history-list');
  if (!listEl) return;
  if (currentCommentHistory.length === 0) {
    listEl.classList.add('hidden');
    return;
  }
  listEl.classList.remove('hidden');
  listEl.innerHTML = currentCommentHistory.map(h => `
    <div class="flex items-center justify-between text-[10px] t-text-muted">
      <span>💬 ${escapeHtml(h.comment)}</span>
      <span class="font-mono text-[9px]">${h.time}</span>
    </div>
  `).join('');
}

function clearCommentHistory() {
  currentCommentHistory = [];
  renderCommentHistory();
}

function togglePromptCopyMenu(event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById('menu-prompt-copy');
  const icon = document.getElementById('icon-prompt-menu');
  if (menu) {
    const isHidden = menu.classList.contains('hidden');
    if (isHidden) {
      menu.classList.remove('hidden');
      if (icon) icon.classList.add('rotate-180');
    } else {
      menu.classList.add('hidden');
      if (icon) icon.classList.remove('rotate-180');
    }
  }
}

function copyGeminiPrompt(scope) {
  const session = window.cockpitSessions.find(s => s.id === window.selectedSessionId);
  const currentTheme = session?.themes?.find(th => th.id === window.selectedThemeId) || session?.themes?.[0];

  if (!session) {
    alert('対象の構想セッションが選択されていません。');
    return;
  }

  let prompt = '';

  if (scope === 'all') {
    const themesText = (session.themes || []).map((th, i) => `
${i + 1}. 【${th.theme}】 (区分: ${th.category || '一般'})
   - 内容: ${th.content || '未定'}
   - 既存初手: ${th.advices?.quick || 'なし'}
`).join('');

    prompt = `あなたはシステム設計・プロダクト開発の熟練アーキテクトです。
私は現在、以下のやりたいこと・構想について検討しており、機能追加や拡張のアイデアが複数出てきてモヤモヤしています。
この構想の全体像を整理し、優先順位のつけ方、段階的リリース計画、アーキテクチャ設計についてブレインストーミング・壁打ちの相手をしてください。

【発想の原点・背景 (Why)】
${session.context || '未設定'}

【現在の検討テーマ・拡張機能候補 (What一覧)】
${themesText}

【あなたへの相談・壁打ち論点】
1. ベースとして最初に形にすべき最小構成（MVP）はどれですか？
2. 残りの拡張アイデアの優先順位（即時着手 / 後回し / 構想ストック）をどう整理すべきですか？
3. 開発をスムーズに進める上で事前に回避すべきボトルネックや落とし穴を教えてください。

まずは客観的な分析と、私への質問・提案を投げかけてください。`;

  } else {
    if (!currentTheme) {
      alert('論点が選択されていません。');
      return;
    }

    const stepsText = (currentTheme.advices?.steps || []).join('\n');

    prompt = `あなたはプロフェッショナルな実行アドバイザーです。
私は現在、以下の特定のやりたいこと・実現論点に着手しようとしています。
実現への技術的アプローチ、今日すぐできる5分アクションの精緻化、落とし穴の回避策について深く壁打ち相手をしてください。

【発想の原点・背景 (Why)】
${session.context || '未設定'}

【対象論点 (What)】
テーマ名: ${currentTheme.theme}
区分: ${currentTheme.category || '一般'}
検討内容: ${currentTheme.content || ''}

【現在検討している実行手順 (How)】
・初手: ${currentTheme.advices?.quick || '未定'}
・続きのステップ:
${stepsText || 'なし'}
・落とし穴: ${currentTheme.advices?.pitfall || 'なし'}

【あなたへの相談・壁打ち論点】
1. この初手はさらに小さく・最速で着手できる形に分解できますか？
2. 実装・実行時に見落としがちな技術選定や効率的な代替手段はありますか？
3. 成果を最大化するためのアドバイスをプロの視点で教えてください。`;
  }

  navigator.clipboard.writeText(prompt.trim()).then(() => {
    togglePromptCopyMenu();
    updateGuidanceBanner('📋 壁打ちプロンプトをコピー！', 'クリップボードにコピーしました。Web版Geminiにそのまま貼り付けて壁打ちしてください。', false, '* 壁打ち結果の新しい知見は、右ペインの「🔄 構想を再構成」や中央の「助言編集」に戻せます。');
    alert(scope === 'all' ? '構想全体の壁打ちプロンプトをコピーしました。\n外部Geminiにペーストしてブレストしてください。' : '選択中論点の深掘りプロンプトをコピーしました。\n外部Geminiにペーストして壁打ちしてください。');
  }).catch(err => {
    alert('プロンプトのコピーに失敗しました: ' + err.message);
  });
}

async function executeDeepDiveAdvice() {
  const session = window.cockpitSessions.find(s => s.id === window.selectedSessionId);
  const theme = session?.themes?.find(th => th.id === window.selectedThemeId);
  if (!theme) return;

  const apiKey = getApiKey();
  if (!apiKey) {
    alert('Gemini APIキーを設定してください。');
    openSettingsModal();
    return;
  }

  const resultBox = document.getElementById('deep-dive-result-box');
  const contentEl = document.getElementById('deep-dive-content');
  const btn = document.getElementById('btn-deep-dive');

  if (resultBox) resultBox.classList.remove('hidden');
  if (contentEl) contentEl.innerHTML = '<div class="text-sky-500 font-bold animate-pulse">🧠 3.8 Flashで多角的に深考中...</div>';
  if (btn) btn.disabled = true;

  const prompt = `論点「${theme.theme}」について、多角的な実現アプローチ、ボトルネックの事前検知、効率を倍増させる代替手段をプロフェッショナルな視点で深掘り精査し、3つの箇条書きで簡潔に出力してください。`;

  try {
    const res = await callGeminiWithStepwiseTimeout(prompt, apiKey, true);
    if (contentEl) contentEl.innerHTML = `<div class="whitespace-pre-wrap leading-relaxed">${escapeHtml(res)}</div>`;
  } catch (e) {
    if (contentEl) contentEl.innerHTML = `<div class="text-rose-500">深考エラー: ${escapeHtml(e.message)}</div>`;
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ==========================================
// 10. メモ取り込み ＆ 33%刻みチェックリスト自動連動
// ==========================================

function openImportConfirmModal() {
  document.getElementById('import-confirm-modal')?.classList.remove('hidden');
}

function closeImportConfirmModal() {
  document.getElementById('import-confirm-modal')?.classList.add('hidden');
}

function executeImportAdvice(mode) {
  closeImportConfirmModal();
  const session = window.cockpitSessions.find(s => s.id === window.selectedSessionId);
  const theme = session?.themes?.find(th => th.id === window.selectedThemeId);
  if (!theme || !theme.advices) return;

  let task = window.cockpitTasks.find(t => t.id === window.selectedTaskId);
  if (!task && theme) {
    task = window.cockpitTasks.find(t => t.themeId === theme.id);
  }

  if (!task) {
    alert('取り込み先のアクションがありません。左ペインでアクションを選択してください。');
    return;
  }

  const newLines = [];
  if (theme.advices.quick) newLines.push(`[ ] 【初手】${theme.advices.quick}`);
  (theme.advices.steps || []).forEach(st => newLines.push(`[ ] ${st}`));

  const newText = newLines.join('\n');
  if (mode === 'append' && task.progressNote) {
    task.progressNote = task.progressNote.trim() + '\n' + newText;
  } else {
    task.progressNote = newText;
    task.progressPercent = 0;
  }

  window.taskAccordionOpenMap[task.id] = true;

  saveDataToLocalStorage();
  renderTasks();
  renderAdviceSection();
  updateGuidanceBanner('📥 助言の取込完了', `「${task.title}」に進捗チェックリストを生成しました。初手を達成してレ点を入れましょう！`, false, '* レ点を1つ入れるごとに進捗バーが 33% → 67% → 100% と自動連動します。');
  if (window.lucide) lucide.createIcons();
}

function toggleTaskCheckItem(taskId, itemIndex) {
  const task = window.cockpitTasks.find(t => t.id === taskId);
  if (!task || !task.progressNote) return;

  const items = parseChecklistFromNote(task.progressNote);
  if (items[itemIndex]) {
    items[itemIndex].checked = !items[itemIndex].checked;
    task.progressNote = items.map(it => `[${it.checked ? 'x' : ' '}] ${it.text}`).join('\n');

    const total = items.length;
    const checkedCount = items.filter(it => it.checked).length;
    task.progressPercent = total > 0 ? Math.round((checkedCount / total) * 100) : 0;
    if (task.progressPercent === 100) task.completed = true;

    saveDataToLocalStorage();
    renderTasks();
    updateGuidanceBanner('✅ 進捗更新', `「${task.title}」の進捗率が ${task.progressPercent}% に更新されました。`, false, `* 完了状況: ${checkedCount}/${total} 項目クリア`);
    if (window.lucide) lucide.createIcons();
  }
}

// ==========================================
// 11. 手動 やりたいこと新規追加
// ==========================================

function openAddTaskModal() {
  document.getElementById('add-task-title').value = '';
  document.getElementById('add-task-category').value = '';
  document.getElementById('add-task-description').value = '';
  document.getElementById('add-task-reason').value = '';
  document.getElementById('add-task-start').value = formatTodayStr();
  document.getElementById('add-task-due').value = '';
  document.getElementById('add-task-hours').value = 4;
  document.getElementById('add-task-priority').value = '未定';
  document.getElementById('add-task-modal')?.classList.remove('hidden');
}

function closeAddTaskModal() {
  document.getElementById('add-task-modal')?.classList.add('hidden');
}

async function saveNewTaskManual() {
  const title = document.getElementById('add-task-title')?.value.trim();
  if (!title) {
    alert('やりたいこと名称を入力してください。');
    return;
  }

  const category = document.getElementById('add-task-category')?.value.trim() || '一般';
  const description = document.getElementById('add-task-description')?.value.trim() || '';
  const reason = document.getElementById('add-task-reason')?.value.trim() || '';
  const startDate = document.getElementById('add-task-start')?.value || formatTodayStr();
  const dueDate = document.getElementById('add-task-due')?.value || '';
  const hours = parseFloat(document.getElementById('add-task-hours')?.value) || 4;
  const priority = document.getElementById('add-task-priority')?.value || '未定';
  const aiReverse = document.getElementById('add-task-ai-reverse')?.checked;

  closeAddTaskModal();

  const newSessionId = 'sess_' + Date.now();
  const newThemeId = 'th_' + Date.now();
  const newTaskId = 't_' + Date.now();

  let advices = { quick: 'まずは計画の詳細を1枚のメモに整理する（3分）。', steps: ['第2手: 必要な準備物を洗い出す', '第3手: 実行スケジュールを確定する'], pitfall: 'あれこれ手を広げすぎないこと。' };

  if (aiReverse && getApiKey()) {
    updateGuidanceBanner('🧠 AI逆算生成中...', `「${title}」から発想原点・論点・初手を構築しています。`, true);
    try {
      const prompt = `「${title}」（概要: ${description}）について、初手（5分でできるアクション）と続きの2手、落とし穴をJSON出力してください。
{"quick": "〜〜", "steps": ["第2手: 〜〜", "第3手: 〜〜"], "pitfall": "〜〜"}`;
      const res = await callGeminiWithStepwiseTimeout(prompt, getApiKey(), false);
      advices = cleanAndParseJson(res);
    } catch (e) {
      console.warn('AI逆算スキップ:', e);
    }
  }

  const newSession = {
    id: newSessionId,
    timestamp: formatTimestamp(new Date()),
    context: reason || `${title}を着実にカタチにするための発想からスタート。`,
    themes: [{
      id: newThemeId,
      theme: title,
      category: category,
      content: description || title,
      advices: advices
    }]
  };

  const newTask = {
    id: newTaskId,
    sessionId: newSessionId,
    themeId: newThemeId,
    category: category,
    title: title,
    description: description,
    startDate: startDate,
    dueDate: dueDate,
    hours: hours,
    actualHours: 0,
    priority: priority,
    progressPercent: 0,
    progressNote: '',
    completed: false,
    needsAttention: !dueDate || priority === '未定',
    createdAt: Date.now()
  };

  window.cockpitSessions.unshift(newSession);
  window.cockpitTasks.unshift(newTask);

  saveDataToLocalStorage();
  selectTask(newTaskId, true);
  updateGuidanceBanner('🎉 登録完了', `「${title}」を追加しました。`, false, '* ガントチャート側にも自動的に同期されます。');
}

// 互換性維持モーダル
function openEditTaskModal(taskId) {
  window.inlineEditingTaskId = taskId;
  renderTasks();
}
function closeEditModal() {
  window.inlineEditingTaskId = null;
  renderTasks();
}
function saveTaskEdit() {
  closeEditModal();
}
function setEditProgressPercent(percent) {}

function openEditThemeModal(themeId) {
  window.inlineEditingThemeId = themeId;
  const session = window.cockpitSessions.find(s => s.id === window.selectedSessionId);
  if (session) renderThemesSection(session);
}
function closeThemeEditModal() {
  window.inlineEditingThemeId = null;
  renderCenterPane();
}
function saveThemeEdit() {
  closeThemeEditModal();
}

function openEditAdviceModal() {
  toggleInlineEditAdvice(true);
}
function closeEditAdviceModal() {
  toggleInlineEditAdvice(false);
}
function saveAdviceEdit() {
  saveInlineAdviceEdit();
}

// ==========================================
// 12. 右ペイン：音声推敲 ＆ 不足深掘り対話 ＆ 構想再構成
// ==========================================

function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;

  recognition = new SpeechRecognition();
  recognition.lang = 'ja-JP';
  recognition.interimResults = true;
  recognition.continuous = true;

  recognition.onstart = () => {
    isRecording = true;
    updateMicUI(true);
    updateGuidanceBanner('🎙️ 音声入力中', '思いついたアイデアを自由にお話しください。話し終わったらマイクを停止します。', true);
  };

  recognition.onresult = (event) => {
    let interim = '';
    let final = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) final += event.results[i][0].transcript;
      else interim += event.results[i][0].transcript;
    }
    const inputArea = document.getElementById('input-text');
    if (inputArea) {
      if (final) {
        currentRawTranscript += (currentRawTranscript ? ' ' : '') + final;
        inputArea.value = currentRawTranscript;
      } else if (interim) {
        inputArea.value = currentRawTranscript + ' ' + interim;
      }
    }
  };

  recognition.onerror = () => {
    isRecording = false;
    updateMicUI(false);
  };

  recognition.onend = () => {
    isRecording = false;
    updateMicUI(false);
    const inputArea = document.getElementById('input-text');
    if (inputArea && inputArea.value.trim()) {
      updateGuidanceBanner('✨ 録音完了・推敲待ち', '「✨ スッキリ推敲」を押して文章を整えるか、「❓ 不足を深掘り」を押してください。', false, '* 段落改行や主語述語の整理が行われます。');
    }
  };

  const micBtn = document.getElementById('btn-toggle-mic');
  if (micBtn) {
    micBtn.onclick = () => {
      if (isRecording) {
        recognition.stop();
      } else {
        currentRawTranscript = document.getElementById('input-text')?.value || '';
        recognition.start();
      }
    };
  }

  document.getElementById('btn-clear-text')?.addEventListener('click', () => {
    const inputEl = document.getElementById('input-text');
    if (inputEl) inputEl.value = '';
    currentRawTranscript = '';
    document.getElementById('raw-voice-accordion')?.classList.add('hidden');
    closeDeepAskBox();
  });
}

function updateMicUI(recording) {
  const micBtn = document.getElementById('btn-toggle-mic');
  const statusText = document.getElementById('mic-status-text');
  const indicator = document.getElementById('mic-indicator');
  const statusBox = document.getElementById('mic-status-box');
  const inputArea = document.getElementById('input-text');

  if (recording) {
    if (micBtn) micBtn.classList.add('recording-active', 'bg-rose-600', 'text-white');
    if (statusText) statusText.textContent = '録音中... (発話中)';
    if (indicator) indicator.classList.remove('hidden');
    if (statusBox) statusBox.classList.add('recording-glow-frame');
    if (inputArea) inputArea.classList.add('recording-glow-frame');
  } else {
    if (micBtn) micBtn.classList.remove('recording-active', 'bg-rose-600', 'text-white');
    if (statusText) statusText.textContent = '停止中';
    if (indicator) indicator.classList.add('hidden');
    if (statusBox) statusBox.classList.remove('recording-glow-frame');
    if (inputArea) inputArea.classList.remove('recording-glow-frame');
  }
}

async function askAiForMissingDetails() {
  const inputEl = document.getElementById('input-text');
  const text = inputEl?.value?.trim();
  const askBox = document.getElementById('deep-ask-box');
  const askQuestionEl = document.getElementById('deep-ask-question');
  const askBtn = document.getElementById('btn-deep-ask');
  const askLabel = document.getElementById('label-deep-ask');

  if (!text) {
    alert('まずはマイクまたはキーボードで、思いついたアイデアをお話しください。');
    return;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    alert('Gemini APIキーを設定してください。');
    openSettingsModal();
    return;
  }

  if (askLabel) askLabel.textContent = '⏳ 考え中...';
  if (askBtn) askBtn.disabled = true;

  if (askBox) {
    askBox.classList.remove('hidden');
    if (askQuestionEl) askQuestionEl.innerHTML = '<span class="text-sky-600 dark:text-sky-400 font-bold animate-pulse">🤖 AIが思考内容をチェック中...</span>';
  }

  updateGuidanceBanner('❓ AIが思考内容をチェック中...', '話された内容を受け止めた上で、深掘り余地を精査しています。', true);

  const prompt = `あなたはプロフェッショナルな思考整理のカウンセラー・参謀AIです。
ユーザーから以下のやりたいこと・構想のアイデアメモが入力されました。

【あなたの厳格タスク】
1. まず、ユーザーが話した内容をしっかり精読・理解してください。
2. 「ダメ出し（不足しています、〜がありません）」は絶対に禁止です。ユーザーが既に話している要素（背景・きっかけ・やりたいこと・ゴールなど）を再度尋ねるような愚行は絶対に避けてください。
3. 判定ロジック：
   - 【十分語られている場合】：
     「〇〇という発想、とても具体的で素晴らしいですね！背景やゴールがしっかり伝わってきます。このまま『構想ストック』または『アクション化』に進んでバッチリです！」と太鼓判を押してください。
   - 【さらに解像度を上げる余地がある場合】：
     ①「〇〇についての発想、すごく面白いですね！」と、話してくれた要点を1行で肯定・受容してください。
     ② その上で、「もし現時点でイメージがあれば、〇〇について一言だけ教えていただけますか？（未定なら『特にない』で大丈夫です）」と、ユーザーがまだ語っていない1点だけを優しく尋ねてください。
4. 出力ルール：
   - 挨拶や前置きは省き、上記メッセージ本文（受容＋質問、または受容＋太鼓判）のみを出力してください。

【ユーザーの入力テキスト】
${text}`;

  try {
    const question = await callGeminiWithStepwiseTimeout(prompt, apiKey, false);
    if (askQuestionEl) {
      askQuestionEl.textContent = question.trim();
    }
    updateGuidanceBanner('❓ AIのチェック結果を表示しました', '入力欄の直下の問いかけをご確認ください。決まっていなければ無視してそのまま登録してOKです。', false);
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    if (askQuestionEl) {
      askQuestionEl.textContent = 'チェック処理に失敗しました: ' + e.message;
    }
  } finally {
    if (askLabel) askLabel.textContent = '❓ 不足を深掘り';
    if (askBtn) askBtn.disabled = false;
  }
}

function closeDeepAskBox() {
  document.getElementById('deep-ask-box')?.classList.add('hidden');
}

function answerDeepAskWithMic() {
  const inputEl = document.getElementById('input-text');
  if (inputEl) {
    inputEl.focus();
    inputEl.value = inputEl.value.trim() + '\n\n【追加の回答】: ';
    currentRawTranscript = inputEl.value;
  }
  document.getElementById('btn-toggle-mic')?.click();
}

async function polishInputTextWithAI() {
  const inputEl = document.getElementById('input-text');
  const text = inputEl?.value?.trim();
  if (!text) {
    alert('推敲するテキストがありません。話すか入力してください。');
    return;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    alert('Gemini APIキーを設定してください。');
    openSettingsModal();
    return;
  }

  updateGuidanceBanner('✨ スッキリ推敲中...', 'AI Studio水準で、句点区切り・段落分け・主語述語の補正を行っています。', true);

  const prompt = `あなたはプロの文字起こし編集・文章校正のスペシャリストです。
音声入力特有の「句読点のないベタ書きテキスト」や「言い淀み」を、
話し手の具体的なアイデア、熱量、数字、固有名詞などの情報量を100%完全に保ったまま、
極めて読みやすく美しい日本語の文章に整形（リライト）してください。

【厳格ルール】
1. 適切な句読点と段落改行（構造化）：句点を適切に打ち、話題の切れ目で空行を入れること。
2. 1文の日本語チェック：主語述語のねじれを補正し、フィラー（えーと、あの等）は完全排除すること。
3. 要約は厳禁：箇条書きにして短くまとめたり、重要例を削って要約してはいけません。
4. 出力形式：前置きや挨拶は一切含めず、整形後の文章のみを出力してください。

【元の発話テキスト】
${text}`;

  try {
    const polished = await callGeminiWithStepwiseTimeout(prompt, apiKey, false);
    const rawTextEl = document.getElementById('raw-voice-text');
    const accordion = document.getElementById('raw-voice-accordion');
    if (rawTextEl) rawTextEl.textContent = text;
    if (accordion) accordion.classList.remove('hidden');

    inputEl.value = polished.trim();
    currentRawTranscript = inputEl.value;
    updateGuidanceBanner('💡 推敲完了', '段落改行と文脈チェックを行いました。「💡 構想ストック」または「🚀 アクション化」を押してください。', false, '* 元の生発話テキストはアコーディオンでいつでも確認できます。');
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    alert('推敲失敗: ' + e.message);
  }
}

function switchToNewIdeaMode() {
  window.inputTargetMode = 'new';
  updateRightPaneButtons();
  updateGuidanceBanner('✨ 新規アイデア入力モード', '新しい案件として入力できます。話した内容は「💡 構想ストック」で新規保存されます。', false);
  const inputEl = document.getElementById('input-text');
  if (inputEl) inputEl.focus();
}

function updateRightPaneButtons() {
  const stockBtn = document.getElementById('btn-stock-idea');
  const stockLabel = document.getElementById('label-stock-btn');
  const stockIcon = document.getElementById('icon-stock-btn');
  const modeBadge = document.getElementById('badge-input-mode');
  const switchBtn = document.getElementById('btn-switch-to-new-input');

  const session = window.cockpitSessions.find(s => s.id === window.selectedSessionId);
  const currentTheme = session?.themes?.find(th => th.id === window.selectedThemeId);

  const isReconstructActive = window.inputTargetMode === 'reconstruct' && currentTheme;

  if (isReconstructActive) {
    if (modeBadge) {
      modeBadge.textContent = `🔄 再構成: ${currentTheme.theme}`;
      modeBadge.className = 'px-2 py-0.5 rounded-full text-[10px] font-mono font-black bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/40 truncate max-w-[130px]';
      modeBadge.title = `構想「${currentTheme.theme}」を再構成中`;
    }
    if (switchBtn) switchBtn.classList.remove('hidden');

    if (stockLabel) stockLabel.textContent = '🔄 構想を再構成';
    if (stockIcon) stockIcon.setAttribute('data-lucide', 'refresh-cw');
    if (stockBtn) {
      stockBtn.className = 'py-2.5 px-2 bg-amber-600 hover:bg-amber-700 text-white font-black rounded-xl text-xs shadow flex items-center justify-center gap-1 transition active:scale-[0.99] disabled:opacity-50 cursor-pointer';
      stockBtn.title = `選択中の構想「${currentTheme.theme}」に入力内容を融合してガラガラポン再構成します`;
    }
  } else {
    if (modeBadge) {
      modeBadge.textContent = '✨ 新規アイデア';
      modeBadge.className = 'px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30 truncate max-w-[130px]';
      modeBadge.title = '新しいアイデア・構想を入力中';
    }
    if (switchBtn) switchBtn.classList.add('hidden');

    if (stockLabel) stockLabel.textContent = '💡 構想ストック';
    if (stockIcon) stockIcon.setAttribute('data-lucide', 'lightbulb');
    if (stockBtn) {
      stockBtn.className = 'py-2.5 px-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-xs shadow flex items-center justify-center gap-1 transition active:scale-[0.99] disabled:opacity-50 cursor-pointer';
      stockBtn.title = '新しい案件として温め棚（構想ストック）に保存します';
    }
  }
  if (window.lucide) lucide.createIcons();
}

function handleStockButtonClick() {
  const session = window.cockpitSessions.find(s => s.id === window.selectedSessionId);
  const currentTheme = session?.themes?.find(th => th.id === window.selectedThemeId);

  if (window.inputTargetMode === 'reconstruct' && currentTheme) {
    reconstructCurrentIdea();
  } else {
    processWithAI('idea');
  }
}

async function reconstructCurrentIdea() {
  const inputEl = document.getElementById('input-text');
  const additionalText = inputEl?.value?.trim();
  if (!additionalText) {
    alert('再構成のための追加アイデアや思考を話すか入力してください。');
    return;
  }

  const session = window.cockpitSessions.find(s => s.id === window.selectedSessionId);
  const theme = session?.themes?.find(th => th.id === window.selectedThemeId);
  if (!session || !theme) return;

  const apiKey = getApiKey();
  if (!apiKey) {
    alert('Gemini APIキーを設定してください。');
    openSettingsModal();
    return;
  }

  updateGuidanceBanner('🔄 思考をガラガラポン再構成中...', `構想「${theme.theme}」に追加の思考を融合させています。`, true);

  const prompt = `あなたはパーソナルコックピットの参謀AIです。
既存の構想（Why・What・How）に対して、ユーザーから追加のアイデアや思考が入力されました。
ユーザーの思考の核を尊重しながら、追加内容をガッチャンコ融合し、発想背景(Why)、発展した実現論点(What)、今日すぐ着手できる初手(How)を丸ごと最新状態にガラガラポン再構成してください。
※「特にない」「わからない」という記載がある場合は、「直感的な発想・関心からスタート」として前向きに解釈してください。

【厳格ルール】
1. theme: 発展した論点・構想名（全角24文字程度）。
2. content: 具体論点の要約（100〜150文字程度で何を議論・検証するか）。
3. actionTitle: この論点から着手する実行タスク名（全角24文字程度・行動形）。
4. actionGoal: 達成すべきゴール状態（50〜80文字程度）。

【既存の思考背景 (Why)】
${session.context}

【既存の論点 (What)】
${theme.theme}: ${theme.content}

【ユーザーからの追加アイデア】
${additionalText}

【出力JSON構造】
{
  "context": "融合・発展させた発想の背景（客観的きっかけを1〜2文）...",
  "theme": "発展した論点・構想名 (全角24文字程度)",
  "category": "${theme.category || '一般'}",
  "content": "発展した具体論点 (100〜150文字程度)...",
  "actionTitle": "実行タスク名 (全角24文字程度)",
  "actionGoal": "達成すべきゴール状態 (50〜80文字程度)",
  "advices": {
    "quick": "融合後の最速の初手（5分）",
    "steps": ["第2手: 〜〜", "第3手: 〜〜"],
    "pitfall": "〜〜に注意。"
  }
}`;

  try {
    const rawResponse = await callGeminiWithStepwiseTimeout(prompt, apiKey, false);
    const parsed = cleanAndParseJson(rawResponse);

    session.context = parsed.context || session.context;
    theme.theme = parsed.theme || theme.theme;
    theme.category = parsed.category || theme.category;
    theme.content = parsed.content || theme.content;
    theme.actionTitle = parsed.actionTitle || theme.actionTitle;
    theme.actionGoal = parsed.actionGoal || theme.actionGoal;
    theme.advices = parsed.advices || theme.advices;

    inputEl.value = '';
    currentRawTranscript = '';
    document.getElementById('raw-voice-accordion')?.classList.add('hidden');
    closeDeepAskBox();

    saveDataToLocalStorage();
    renderStockIdeas();
    renderCenterPane();
    updateGuidanceBanner('✨ 再構成完了！', `構想「${theme.theme}」を最新の思考へとアップデートしました。`, false);
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    alert('構想の再構成に失敗しました: ' + e.message);
  }
}

// 資料添付
function initAttachmentListeners() {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');

  if (!dropZone || !fileInput) return;

  dropZone.onclick = () => fileInput.click();

  dropZone.ondragover = (e) => {
    e.preventDefault();
    dropZone.classList.add('border-sky-500', 'bg-sky-500/10');
  };

  dropZone.ondragleave = () => {
    dropZone.classList.remove('border-sky-500', 'bg-sky-500/10');
  };

  dropZone.ondrop = (e) => {
    e.preventDefault();
    dropZone.classList.remove('border-sky-500', 'bg-sky-500/10');
    if (e.dataTransfer?.files) {
      handleFilesSelected(e.dataTransfer.files);
    }
  };

  fileInput.onchange = (e) => {
    if (e.target.files) {
      handleFilesSelected(e.target.files);
    }
  };
}

function handleFilesSelected(fileList) {
  Array.from(fileList).forEach(file => {
    const reader = new FileReader();
    const isText = file.type.startsWith('text/') || 
                   file.name.endsWith('.txt') || 
                   file.name.endsWith('.md') || 
                   file.name.endsWith('.json') || 
                   file.name.endsWith('.csv');

    if (isText) {
      reader.onload = (e) => {
        const textContent = e.target.result;
        addAttachmentItem(file.name, file.size, textContent);
      };
      reader.readAsText(file);
    } else {
      addAttachmentItem(file.name, file.size, null);
    }
  });
}

function addAttachmentItem(fileName, fileSize, content) {
  const id = 'att_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5);
  window.cockpitAttachments.push({ id, name: fileName, size: fileSize, content });
  renderAttachmentList();
}

function renderAttachmentList() {
  const listEl = document.getElementById('attachment-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  window.cockpitAttachments.forEach(att => {
    const item = document.createElement('div');
    item.className = 'flex items-center justify-between p-1.5 rounded-lg border t-card-sub text-[10px] gap-2';
    item.innerHTML = `
      <div class="flex items-center gap-1.5 min-w-0 flex-1">
        <i data-lucide="file-text" class="w-3 h-3 text-sky-500 shrink-0"></i>
        <span class="truncate font-bold t-text-main" title="${escapeHtml(att.name)}">${escapeHtml(att.name)}</span>
        <span class="text-[9px] t-text-muted">(${Math.round(att.size / 1024)}KB)</span>
      </div>
      <div class="flex items-center gap-1 shrink-0">
        ${att.content ? `
          <button onclick="expandAttachmentToInput('${att.id}')" class="px-2 py-0.5 rounded bg-sky-600 hover:bg-sky-700 text-white font-bold text-[9px] shadow-sm transition active:scale-95" title="この資料の中身を入力エリアに貼り付ける">
            📥 展開
          </button>
        ` : `
          <span class="text-[9px] t-text-muted">参考資料</span>
        `}
        <button onclick="removeAttachment('${att.id}')" class="text-slate-400 hover:text-rose-500 p-0.5 transition">
          <i data-lucide="x" class="w-3 h-3"></i>
        </button>
      </div>
    `;
    listEl.appendChild(item);
  });
  if (window.lucide) lucide.createIcons();
}

function expandAttachmentToInput(attachmentId) {
  const att = window.cockpitAttachments.find(a => a.id === attachmentId);
  if (!att || !att.content) return;

  const inputEl = document.getElementById('input-text');
  if (inputEl) {
    if (inputEl.value.trim()) {
      inputEl.value = inputEl.value.trim() + '\n\n' + att.content.trim();
    } else {
      inputEl.value = att.content.trim();
    }
    currentRawTranscript = inputEl.value;
    updateGuidanceBanner('📄 資料本文を展開しました', `資料「${att.name}」の内容を入力欄に反映しました。`, false);
  }
}

function removeAttachment(attachmentId) {
  window.cockpitAttachments = window.cockpitAttachments.filter(a => a.id !== attachmentId);
  renderAttachmentList();
}

function setMode(mode) {
  currentAiMode = mode;
  const btnLite = document.getElementById('mode-btn-lite');
  const btnDeep = document.getElementById('mode-btn-deep');
  if (mode === 'lite') {
    if (btnLite) btnLite.className = 'flex-1 py-1 px-1 rounded-md font-black transition flex items-center justify-center gap-1 bg-sky-600 text-white shadow-sm cursor-pointer';
    if (btnDeep) btnDeep.className = 'flex-1 py-1 px-1 rounded-md font-bold transition flex items-center justify-center gap-1 text-slate-500 dark:text-slate-400 hover:t-text-main cursor-pointer';
  } else {
    if (btnDeep) btnDeep.className = 'flex-1 py-1 px-1 rounded-md font-black transition flex items-center justify-center gap-1 bg-sky-600 text-white shadow-sm cursor-pointer';
    if (btnLite) btnLite.className = 'flex-1 py-1 px-1 rounded-md font-bold transition flex items-center justify-center gap-1 text-slate-500 dark:text-slate-400 hover:t-text-main cursor-pointer';
  }
}

function toggleRawVoiceView() {
  const body = document.getElementById('raw-voice-body');
  const icon = document.getElementById('raw-voice-icon');
  if (body) {
    const isHidden = body.classList.contains('hidden');
    if (isHidden) {
      body.classList.remove('hidden');
      if (icon) icon.classList.add('rotate-180');
    } else {
      body.classList.add('hidden');
      if (icon) icon.classList.remove('rotate-180');
    }
  }
}

function restoreRawText() {
  const raw = document.getElementById('raw-voice-text')?.textContent;
  const inputEl = document.getElementById('input-text');
  if (raw && inputEl) {
    inputEl.value = raw;
    currentRawTranscript = raw;
  }
}

function copyRawText() {
  const raw = document.getElementById('raw-voice-text')?.textContent;
  if (raw) {
    navigator.clipboard.writeText(raw);
    alert('生テキストをコピーしました');
  }
}

async function processWithAI(targetType = 'idea') {
  const inputEl = document.getElementById('input-text');
  const text = inputEl?.value?.trim();
  if (!text) {
    alert('入力テキストがありません。音声またはテキストを入力してください。');
    return;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    alert('Gemini APIキーを設定してください。');
    openSettingsModal();
    return;
  }

  updateGuidanceBanner('🧠 AI思考構造化中...', '発想原点(Why)・論点(What)・初手(How)を逆算構築しています。', true);

  const prompt = `あなたはパーソナルコックピットの参謀AIです。
ユーザーの以下の思考・発話テキストから、発想のきっかけ・背景(Why)、具体的な実現論点(What)、今日すぐ着手できる初手助言(How)を抽出し、指定のJSON形式で出力してください。
※「特にない」「わからない」といった記載がある場合は、「直感的な好奇心・関心からスタート」として前向きに解釈してください。

【厳格ルール】
1. context (Why): 感情的なポエムは排除し、客観的な事実・問題意識・きっかけを1〜2文で記述。
2. themes (What): 1〜3個の論点。
   - theme: 検討する論点・テーマ名（全角24文字程度）。
   - category: 適切な区分名（一般、開発、運用 等）。
   - content: 具体論点の要約（100〜150文字程度で何を議論・検証するか）。
   - actionTitle: 左ペインに登録する実行アクション名（全角24文字程度・動詞/行動形）。
   - actionGoal: 左ペインに登録する達成ゴール状態（50〜80文字程度で完了定義を記述）。
3. advices (How):
   - quick: 「今日すぐ5分以内にできる具体的な最初の一手」
   - steps: 続きのステップ（第2手、第3手）
   - pitfall: よくある落とし穴と回避の知恵
4. 純粋なJSONオブジェクトのみを出力すること。

【入力テキスト】
${text}

【出力JSON構造】
{
  "context": "発想の背景（客観的事実・きっかけを1〜2文）...",
  "themes": [
    {
      "theme": "論点テーマ名 (全角24文字程度)",
      "category": "区分",
      "content": "具体論点の要約 (100〜150文字程度)...",
      "actionTitle": "実行アクション名 (全角24文字程度)",
      "actionGoal": "達成すべきゴール状態 (50〜80文字程度)",
      "advices": {
        "quick": "まずは〜〜（5分）。",
        "steps": ["第2手: 〜〜", "第3手: 〜〜"],
        "pitfall": "〜〜に注意。"
      }
    }
  ]
}`;

  try {
    const rawResponse = await callGeminiWithStepwiseTimeout(prompt, apiKey, false);
    const parsed = cleanAndParseJson(rawResponse);

    const newSessionId = 'sess_' + Date.now();
    const newSession = {
      id: newSessionId,
      timestamp: formatTimestamp(new Date()),
      context: parsed.context || '思考背景の記録',
      themes: (parsed.themes || []).map((th, idx) => ({
        id: `th_${Date.now()}_${idx}`,
        theme: th.theme || '新規テーマ',
        category: th.category || '一般',
        content: th.content || '',
        actionTitle: th.actionTitle || th.theme || '新規アクション',
        actionGoal: th.actionGoal || (th.content ? th.content.substring(0, 80) : ''),
        advices: th.advices || { quick: '', steps: [], pitfall: '', comments: [] }
      }))
    };

    window.cockpitSessions.unshift(newSession);

    if (targetType === 'action' && newSession.themes.length > 0) {
      const firstTheme = newSession.themes[0];
      const todayStr = formatTodayStr();
      const taskTitle = firstTheme.actionTitle || firstTheme.theme;
      const taskDesc = firstTheme.actionGoal || (firstTheme.content ? firstTheme.content.substring(0, 120) : '');

      const newTask = {
        id: 't_' + Date.now(),
        sessionId: newSession.id,
        themeId: firstTheme.id,
        category: firstTheme.category,
        title: taskTitle,
        description: taskDesc,
        startDate: todayStr,
        dueDate: '',
        hours: 4,
        actualHours: 0,
        priority: '未定',
        progressPercent: 0,
        progressNote: '',
        completed: false,
        needsAttention: true,
        createdAt: Date.now()
      };
      window.cockpitTasks.unshift(newTask);
      window.selectedTaskId = newTask.id;
    }

    inputEl.value = '';
    currentRawTranscript = '';
    document.getElementById('raw-voice-accordion')?.classList.add('hidden');
    closeDeepAskBox();

    saveDataToLocalStorage();
    window.selectedSessionId = newSession.id;
    window.selectedThemeId = newSession.themes[0]?.id;
    window.inputTargetMode = 'new';

    renderTasks();
    renderCenterPane();
    updateRightPaneButtons();
    updateGuidanceBanner('🎉 登録完了', targetType === 'action' ? 'アクションを生成しました。「目標日未設定」から目標日を決めてください。' : '構想ストック（温め棚）に保存しました。', false);
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    alert('AI処理失敗: ' + e.message);
  }
}

// ==========================================
// 13. モーダル制御（ガイド、バージョン、設定）
// ==========================================

function openGuideModal() {
  document.getElementById('guide-modal')?.classList.remove('hidden');
}

function closeGuideModal() {
  document.getElementById('guide-modal')?.classList.add('hidden');
}

function switchGuideTab(tabNum) {
  for (let i = 1; i <= 4; i++) {
    const btn = document.getElementById(`guide-tab-btn-${i}`);
    const tab = document.getElementById(`guide-tab-${i}`);
    if (i === tabNum) {
      if (btn) btn.className = 'px-3.5 py-1.5 rounded-lg bg-sky-600 text-white shadow-sm flex items-center gap-1.5 transition whitespace-nowrap cursor-pointer';
      if (tab) tab.classList.remove('hidden');
    } else {
      if (btn) btn.className = 'px-3.5 py-1.5 rounded-lg t-card-sub border t-text-muted hover:t-text-main flex items-center gap-1.5 transition whitespace-nowrap cursor-pointer';
      if (tab) tab.classList.add('hidden');
    }
  }
}

function openVersionModal() {
  const modal = document.getElementById('version-modal');
  const listEl = document.getElementById('version-history-list');
  const sysDateEl = document.getElementById('lbl-system-date');

  const verData = window.COCKPIT_VERSION_DATA;
  if (verData) {
    if (sysDateEl) sysDateEl.textContent = verData.systemDate;
    if (listEl) {
      listEl.innerHTML = verData.histories.map(h => `
        <div class="p-2.5 rounded-xl border t-card-sub flex flex-col gap-1">
          <div class="flex items-center justify-between">
            <span class="font-black text-sky-600 dark:text-sky-400 text-xs">${h.ver}</span>
            <span class="text-[10px] t-text-muted font-bold">${h.date}</span>
          </div>
          <p class="text-[11px] t-text-sub leading-relaxed font-sans">${escapeHtml(h.desc)}</p>
        </div>
      `).join('');
    }
  }

  if (modal) modal.classList.remove('hidden');
}

function closeVersionModal() {
  document.getElementById('version-modal')?.classList.add('hidden');
}

function openSettingsModal() {
  const modal = document.getElementById('settings-modal');
  const keyInput = document.getElementById('api-key-input');
  const modelLiteInput = document.getElementById('model-lite-input');
  const modelDeepInput = document.getElementById('model-deep-input');
  const gcalInput = document.getElementById('google-client-id-input');

  if (keyInput) keyInput.value = localStorage.getItem(STORAGE_KEY_API_KEY) || '';
  if (modelLiteInput) modelLiteInput.value = MODEL_PRIMARY;
  if (modelDeepInput) modelDeepInput.value = localStorage.getItem(STORAGE_KEY_MODEL_DEEP) || 'gemini-3.8-flash';
  if (gcalInput) gcalInput.value = localStorage.getItem(STORAGE_KEY_GCAL_CLIENT_ID) || '';

  updateGoogleAuthUI();
  if (modal) modal.classList.remove('hidden');
}

function closeSettingsModal() {
  document.getElementById('settings-modal')?.classList.add('hidden');
}

function saveSettings() {
  const key = document.getElementById('api-key-input')?.value.trim();
  const gcal = document.getElementById('google-client-id-input')?.value.trim() || '';

  localStorage.setItem(STORAGE_KEY_API_KEY, key);
  localStorage.setItem(STORAGE_KEY_MODEL_LITE, MODEL_PRIMARY);
  localStorage.setItem(STORAGE_KEY_GCAL_CLIENT_ID, gcal);

  updateApiStatusIndicator();
  closeSettingsModal();
  alert('設定を保存しました。');
}

function updateApiStatusIndicator() {
  const dot = document.getElementById('api-status-dot');
  const hasKey = !!getApiKey();
  if (dot) {
    dot.className = `w-2 h-2 rounded-full ${hasKey ? 'bg-emerald-500' : 'bg-slate-400'}`;
  }
}

// ==========================================
// 14. Googleカレンダー連携
// ==========================================

function handleGoogleAuth() {
  const clientId = document.getElementById('google-client-id-input')?.value.trim() || 
                   localStorage.getItem(STORAGE_KEY_GCAL_CLIENT_ID);

  if (!clientId) {
    alert('まずはGoogle Calendar OAuth Client IDを入力してください。');
    return;
  }

  if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
    alert('Google Identity 認証ライブラリを読み込み中です。数秒待ってから再度押してください。');
    return;
  }

  try {
    gcalTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/calendar.events',
      callback: (response) => {
        if (response.error) {
          alert('Google認証エラー: ' + response.error);
          return;
        }
        gcalAccessToken = response.access_token;
        updateGoogleAuthUI();
        alert('Google認証に成功しました。カレンダー同期が利用可能です。');
      }
    });

    gcalTokenClient.requestAccessToken({ prompt: 'consent' });
  } catch (err) {
    alert('Google認証クライアントの起動に失敗しました: ' + err.message);
  }
}

function disconnectGoogleCalendar() {
  if (gcalAccessToken && typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
    google.accounts.oauth2.revoke(gcalAccessToken, () => {
      gcalAccessToken = null;
      updateGoogleAuthUI();
      alert('Googleカレンダーの連携を切断しました。');
    });
  } else {
    gcalAccessToken = null;
    updateGoogleAuthUI();
    alert('Googleカレンダーの連携を切断しました。');
  }
}

function updateGoogleAuthUI() {
  const badge = document.getElementById('google-auth-status-badge');
  const btnLogin = document.getElementById('btn-google-login');
  const btnDisconnect = document.getElementById('btn-google-disconnect');

  if (gcalAccessToken) {
    if (badge) {
      badge.textContent = '認証完了';
      badge.className = 'text-[10px] px-1.5 py-0.5 rounded-full font-mono bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold';
    }
    if (btnLogin) btnLogin.classList.add('hidden');
    if (btnDisconnect) btnDisconnect.classList.remove('hidden');
  } else {
    if (badge) {
      badge.textContent = '未認証';
      badge.className = 'text-[10px] px-1.5 py-0.5 rounded-full font-mono bg-slate-500/20 text-slate-500 font-bold';
    }
    if (btnLogin) btnLogin.classList.remove('hidden');
    if (btnDisconnect) btnDisconnect.classList.add('hidden');
  }
}

function toggleCalendarSyncMode() {
  isCalendarSyncEnabled = !isCalendarSyncEnabled;
  localStorage.setItem(STORAGE_KEY_CAL_SYNC, isCalendarSyncEnabled ? 'true' : 'false');
  updateCalendarSyncUI();
}

function updateCalendarSyncUI() {
  const dot = document.getElementById('cal-sync-dot');
  const label = document.getElementById('cal-sync-label');
  const btn = document.getElementById('btn-toggle-cal-sync');

  if (isCalendarSyncEnabled) {
    if (dot) dot.className = 'w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse';
    if (label) label.textContent = 'ON';
    if (btn) btn.className = 'px-1.5 py-0.2 rounded text-[10px] font-mono font-bold transition flex items-center gap-1 shadow-sm bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-500/40 cursor-pointer';
  } else {
    if (dot) dot.className = 'w-1.5 h-1.5 rounded-full bg-slate-500';
    if (label) label.textContent = 'OFF';
    if (btn) btn.className = 'px-1.5 py-0.2 rounded text-[10px] font-mono font-bold transition flex items-center gap-1 shadow-sm bg-slate-300 dark:bg-slate-700 text-slate-800 dark:text-slate-200 cursor-pointer';
  }
}

async function syncAllTasksToGoogleCalendar() {
  if (!isCalendarSyncEnabled) {
    alert('カレンダー同期がOFFになっています。左上のカレンダーボタンをONにしてください。');
    return;
  }

  if (!gcalAccessToken) {
    alert('Googleカレンダーが未認証です。設定画面からGoogle認証を実行してください。');
    openSettingsModal();
    return;
  }

  const tasksWithDue = (window.cockpitTasks || []).filter(t => !t.completed && t.dueDate);
  if (tasksWithDue.length === 0) {
    alert('同期対象の目標日付きアクションがありません。');
    return;
  }

  updateGuidanceBanner('📅 カレンダー同期中...', `${tasksWithDue.length}件のアクションをGoogleカレンダーへ登録しています。`, true);

  let successCount = 0;
  let authExpired = false;

  for (const task of tasksWithDue) {
    try {
      const eventPayload = {
        summary: `【Wish】${task.title}`,
        description: `${task.description || ''}\n\n[進捗メモ]\n${task.progressNote || ''}`,
        start: { date: task.dueDate },
        end: { date: task.dueDate }
      };

      const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${gcalAccessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(eventPayload)
      });

      if (res.status === 401) {
        authExpired = true;
        break;
      }

      if (res.ok) successCount++;
    } catch (e) {
      console.warn('カレンダー登録スキップ:', task.title, e);
    }
  }

  if (authExpired) {
    gcalAccessToken = null;
    updateGoogleAuthUI();
    updateGuidanceBanner('⚠️ Google認証切れ', 'Google認証の有効期限（1時間）が切れました。設定から再認証してください。', true);
    alert('Google認証の有効期限（1時間）が切れました。設定画面から「Googleで認証」を押し直してください。');
    openSettingsModal();
    return;
  }

  updateGuidanceBanner('📅 同期完了', `${successCount}件のアクションをGoogleカレンダーへ同期しました。`, false);
  alert(`${successCount}件のアクションをGoogleカレンダーに正常同期しました。`);
}

// ==========================================
// 15. 通信コア ＆ 段階的タイムアウト・自動救済リトライエンジン
// ==========================================

/**
 * 🌟 段階的タイムアウト（10s ➔ 20s ➔ 30s）＆ 2モデル自動救済リトライ
 * 1. 10秒タイムアウト（第1優先 MODEL_PRIMARY）
 * 2. 失敗時、第2優先 MODEL_BACKUP で即時自動救済リトライ（10秒）
 * 3. 1周ダメなら次は20秒タイムアウトで再試行
 * 4. それでもダメなら30秒タイムアウトまで延長再試行
 * 5. 30秒でも繋がらなければ、混雑状況をユーザーに分かりやすく明示
 */
async function callGeminiWithStepwiseTimeout(prompt, apiKey, isDeep = false) {
  if (isDeep) {
    // 3.8深考は明示指定時のみ使用
    return await executeSingleGeminiFetch(prompt, apiKey, 'gemini-3.8-flash', 30000);
  }

  const timeoutStages = [10000, 20000, 30000]; // 10秒 ➔ 20秒 ➔ 30秒

  for (let stageIdx = 0; stageIdx < timeoutStages.length; stageIdx++) {
    const timeoutMs = timeoutStages[stageIdx];
    const seconds = timeoutMs / 1000;

    // A. 第1優先モデルで試行
    try {
      updateGuidanceBanner('🧠 AIと交信中...', `主軸モデルで思考中 (${seconds}秒判定)...`, true);
      const result = await executeSingleGeminiFetch(prompt, apiKey, MODEL_PRIMARY, timeoutMs);
      return result;
    } catch (primaryErr) {
      console.warn(`第1優先モデル(${MODEL_PRIMARY})失敗 [タイムアウト:${seconds}s]:`, primaryErr.message);

      // B. 即座に第2優先（バックアップ）モデルで自動救済リトライ
      try {
        updateGuidanceBanner('🔄 救済リトライ中...', `バックアップモデル (${MODEL_BACKUP}) で自動再試行中...`, true);
        const backupResult = await executeSingleGeminiFetch(prompt, apiKey, MODEL_BACKUP, timeoutMs);
        updateGuidanceBanner('✨ 自動救済完了', '* 主軸モデル混雑のため、バックアップモデルで自動取得しました。', false);
        return backupResult;
      } catch (backupErr) {
        console.warn(`第2優先モデル(${MODEL_BACKUP})失敗 [タイムアウト:${seconds}s]:`, backupErr.message);
        
        // 次の延長ステージへ進む
        if (stageIdx < timeoutStages.length - 1) {
          const nextSec = timeoutStages[stageIdx + 1] / 1000;
          updateGuidanceBanner('⏳ 通信延長中...', `Google側が混雑しているため、タイムアウトを${nextSec}秒に延長して再接続します...`, true);
        }
      }
    }
  }

  // 30秒タイムアウトまで全て失敗した場合の親切なメッセージ
  const finalErrorMsg = 'Google AIサーバーが極度に混雑しているか、通信が不安定です（10s・20s・30sの延長試行が全てタイムアウトしました）。\n\n入力中のテキストは保持されていますので、少し時間を置いてから再度ボタンを押してください。';
  updateGuidanceBanner('⚠️ AIサーバー極度混雑', 'Googleサーバーが混雑しています。少し時間を置いて再試行してください。', true);
  throw new Error(finalErrorMsg);
}

/**
 * 🌟 単一Fetch実行（AbortControllerによる厳格タイムアウト制御）
 */
async function executeSingleGeminiFetch(prompt, apiKey, modelName, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4 }
      }),
      signal: controller.signal
    });

    clearTimeout(timer);

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('AIからの応答が空でした。');
    return text;

  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new Error(`タイムアウト (${timeoutMs / 1000}秒経過)`);
    }
    throw err;
  }
}

function getApiKey() {
  return localStorage.getItem(STORAGE_KEY_API_KEY) || '';
}

function cleanAndParseJson(raw) {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```json\s*/i, '');
  cleaned = cleaned.replace(/^```\s*/, '');
  cleaned = cleaned.replace(/\s*```$/, '');
  return JSON.parse(cleaned.trim());
}

function parseChecklistFromNote(note) {
  if (!note) return [];
  const lines = note.split('\n');
  const items = [];
  lines.forEach(line => {
    const match = line.match(/^\[([ xX])\]\s*(.*)$/);
    if (match) {
      items.push({
        checked: match[1].toLowerCase() === 'x',
        text: match[2]
      });
    }
  });
  return items;
}

function calculateDaysRemaining(dueDateStr) {
  if (!dueDateStr) return 999;
  const target = new Date(dueDateStr + 'T00:00:00');
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
}

function formatTodayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatTimestamp(d) {
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function sortTaskList(tasks) {
  tasks.sort((a, b) => {
    if (window.currentSortMode === 'due') {
      const dueA = a.dueDate || '9999-99-99';
      const dueB = b.dueDate || '9999-99-99';
      return window.currentSortAsc ? dueA.localeCompare(dueB) : dueB.localeCompare(dueA);
    }
    if (window.currentSortMode === 'priority') {
      const pMap = { '高': 3, '中': 2, '低': 1, '未定': 0 };
      const valA = pMap[a.priority] || 0;
      const valB = pMap[b.priority] || 0;
      return window.currentSortAsc ? valB - valA : valA - valB;
    }
    return window.currentSortAsc ? b.createdAt - a.createdAt : a.createdAt - b.createdAt;
  });
}

function populateCategoryDatalist() {
  const datalist = document.getElementById('category-datalist');
  if (!datalist) return;
  const tasks = window.cockpitTasks || [];
  const categories = [...new Set(tasks.map(t => t.category).filter(Boolean))];
  datalist.innerHTML = categories.map(c => `<option value="${escapeHtml(c)}"></option>`).join('');
}

function setTheme(themeName) {
  document.body.className = `theme-${themeName} h-screen font-sans flex flex-col selection:bg-sky-500 selection:text-white overflow-hidden`;
  localStorage.setItem(STORAGE_KEY_THEME, themeName);

  const btnDark = document.getElementById('theme-btn-dark');
  const btnLight = document.getElementById('theme-btn-light');
  const btnPop = document.getElementById('theme-btn-pop');

  const baseInactiveClass = 'px-1.5 py-0.5 rounded text-[10px] font-bold transition flex items-center cursor-pointer text-slate-500 dark:text-slate-400 hover:t-text-main';

  if (btnDark) btnDark.className = baseInactiveClass;
  if (btnLight) btnLight.className = baseInactiveClass;
  if (btnPop) btnPop.className = baseInactiveClass;

  const activeClass = 'px-1.5 py-0.5 rounded text-[10px] font-black transition flex items-center cursor-pointer bg-sky-600 text-white shadow-sm';

  if (themeName === 'dark' && btnDark) {
    btnDark.className = activeClass;
  } else if (themeName === 'light' && btnLight) {
    btnLight.className = activeClass;
  } else if (themeName === 'pop' && btnPop) {
    btnPop.className = activeClass;
  }
}

// ==========================================
// 16. 🌟【鉄壁データ安全管理】
// ==========================================

function handleStudioImportFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);

      if (!data || (!data.sessions && !data.tasks)) {
        alert('有効なデータ形式ではありませんでした。');
        return;
      }

      const incomingSessions = data.sessions || [];
      const incomingTasks = data.tasks || [];

      if (incomingSessions.length === 0 && incomingTasks.length === 0) {
        alert('引き継ぎデータの中にセッションまたはタスクが見つかりませんでした。');
        return;
      }

      incomingSessions.forEach(newSess => {
        const existIdx = window.cockpitSessions.findIndex(s => s.id === newSess.id);
        if (existIdx >= 0) {
          window.cockpitSessions[existIdx] = newSess;
        } else {
          window.cockpitSessions.unshift(newSess);
        }
      });

      incomingTasks.forEach(newTask => {
        if (newTask.hours === undefined) newTask.hours = 4;
        if (newTask.actualHours === undefined) newTask.actualHours = 0;
        if (newTask.startDate === undefined) newTask.startDate = newTask.dueDate || formatTodayStr();

        const existIdx = window.cockpitTasks.findIndex(t => t.id === newTask.id);
        if (existIdx >= 0) {
          window.cockpitTasks[existIdx] = newTask;
        } else {
          window.cockpitTasks.unshift(newTask);
        }
      });

      saveDataToLocalStorage();
      renderTasks();

      if (incomingTasks.length > 0) {
        selectTask(incomingTasks[0].id, true);
      } else if (incomingSessions.length > 0) {
        window.selectedSessionId = incomingSessions[0].id;
        window.selectedThemeId = incomingSessions[0].themes?.[0]?.id;
        renderCenterPane();
      }

      updateGuidanceBanner('🚀 スタジオ引継完了！', `Thinking Studioから新しい案件を追加しました。（既存データはすべて保持されています）`, false);
      alert(`🎉 Thinking Studioからの引き継ぎが完了しました！\n\n【追加件数】\n・構想セッション: ${incomingSessions.length}件\n・実行アクション: ${incomingTasks.length}件\n\n※既存のデータは1件も消去されず、安全に保持されています。`);

    } catch (err) {
      console.error('Studio引継ぎエラー:', err);
      alert('引き継ぎファイルの読み込みに失敗しました: ' + err.message);
    } finally {
      event.target.value = '';
    }
  };
  reader.readAsText(file);
}

function handleRestoreFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const content = e.target.result;
      let data = null;

      if (file.name.endsWith('.json')) {
        data = JSON.parse(content);
      } else if (file.name.endsWith('.js')) {
        const match = content.match(/window\.COCKPIT_INITIAL_DATA\s*=\s*(\{[\s\S]*\});?/);
        if (match) data = JSON.parse(match[1]);
      }

      if (!data || (!data.sessions && !data.tasks)) {
        alert('有効なWish & Actionデータ形式ではありませんでした。');
        return;
      }

      const isStudioExport = data.source === 'Thinking Studio' || 
                             file.name.toLowerCase().includes('cockpit_transfer');

      if (isStudioExport) {
        alert('⚠️ 【誤爆防止ガード発動】\n\n選択されたファイルは「Thinking Studioの引き継ぎファイル」です！\n\nこのまま「復元」を実行すると、過去の全データが消えてこの1件だけになってしまうため、安全のために処理を中断しました。\n\n新しい案件を追加したい場合は、隣の青い「🚀 スタジオ引継」ボタンをご利用ください。');
        return;
      }

      const confirmMsg = `⚠️ 【警告：システム全体の復元】\n\nファイル名: ${file.name}\n\nこの操作を行うと、現在画面に表示されているデータがバックアップファイルの内容で「丸ごと上書き」されます。\n本当に復元を実行してもよろしいですか？`;
      
      if (!confirm(confirmMsg)) {
        return;
      }

      window.cockpitSessions = data.sessions || [];
      window.cockpitTasks = (data.tasks || []).map(t => {
        if (t.hours === undefined) t.hours = 4;
        if (t.actualHours === undefined) t.actualHours = 0;
        if (t.startDate === undefined) t.startDate = t.dueDate || formatTodayStr();
        return t;
      });

      window.selectedTaskId = null;
      window.selectedSessionId = null;
      window.selectedThemeId = null;

      saveDataToLocalStorage();
      renderTasks();
      renderCenterPane();
      updateRightPaneButtons();

      updateGuidanceBanner('📂 復元完了', 'バックアップファイルからシステム全体を元の状態に復元しました。', false);
      alert('バックアップデータを正常に復元し、ローカルマスターを最新化しました。');

    } catch (err) {
      alert('ファイルの復元に失敗しました: ' + err.message);
    } finally {
      event.target.value = '';
    }
  };
  reader.readAsText(file);
}

function checkStudioInboxQueue() {
  try {
    const rawQueue = localStorage.getItem(COCKPIT_INBOX_KEY);
    if (!rawQueue) return;

    const data = JSON.parse(rawQueue);
    if (!data || (!data.sessions && !data.tasks)) return;

    localStorage.removeItem(COCKPIT_INBOX_KEY);

    const incomingSessions = data.sessions || [];
    const incomingTasks = data.tasks || [];

    incomingSessions.forEach(newSess => {
      if (!window.cockpitSessions.some(s => s.id === newSess.id)) {
        window.cockpitSessions.unshift(newSess);
      }
    });

    incomingTasks.forEach(newTask => {
      if (newTask.hours === undefined) newTask.hours = 4;
      if (newTask.actualHours === undefined) newTask.actualHours = 0;
      if (newTask.startDate === undefined) newTask.startDate = newTask.dueDate || formatTodayStr();

      if (!window.cockpitTasks.some(t => t.id === newTask.id)) {
        window.cockpitTasks.unshift(newTask);
      }
    });

    saveDataToLocalStorage();
    renderTasks();

    if (incomingTasks.length > 0) {
      selectTask(incomingTasks[0].id, true);
    }

    updateGuidanceBanner('🚀 自動引継完了！', 'Thinking Studioで合意された案件を安全に追加しました。', false);

  } catch (e) {
    console.warn('インボックスキュー読み込みスキップ:', e);
  }
}

// ==========================================
// 17. DOM起動時エントリーポイント
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem(STORAGE_KEY_THEME) || 'light';
  setTheme(savedTheme);

  syncHeaderVersionFromMaster();

  initDataStore();
  checkStudioInboxQueue();
  initSpeechRecognition();
  initAttachmentListeners();
  setupStorageEventListener();

  isCalendarSyncEnabled = localStorage.getItem(STORAGE_KEY_CAL_SYNC) === 'true';
  updateCalendarSyncUI();

  document.getElementById('btn-open-settings')?.addEventListener('click', openSettingsModal);
  document.getElementById('btn-close-settings')?.addEventListener('click', closeSettingsModal);
  document.getElementById('btn-save-key')?.addEventListener('click', saveSettings);

  updateApiStatusIndicator();
  renderTasks();
  renderCenterPane();
  updateRightPaneButtons();

  updateClock();
  setInterval(updateClock, 1000);

  document.addEventListener('click', () => {
    const promptMenu = document.getElementById('menu-prompt-copy');
    const promptIcon = document.getElementById('icon-prompt-menu');
    if (promptMenu && !promptMenu.classList.contains('hidden')) {
      promptMenu.classList.add('hidden');
      if (promptIcon) promptIcon.classList.remove('rotate-180');
    }
  });

  if (window.lucide) lucide.createIcons();
});

function updateClock() {
  const el = document.getElementById('current-datetime');
  if (el) {
    const now = new Date();
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    el.textContent = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')} (${days[now.getDay()]}) ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }
}

// デフォルト初期データ
function getInitialDefaultSessions() {
  return [
    {
      id: "sess_init",
      timestamp: "今日",
      context: "やりたいことの発想原点と初手を明確にし、着実にカタチにするためのコックピットを立ち上げた。",
      themes: [{
        id: "th_init",
        theme: "Wish & Action コックピットの初稼働",
        category: "開発ツール",
        content: "マイク入力で思考を話し、初手のアクションを登録して実行する。",
        actionTitle: "コックピットで最初の初手を実行する",
        actionGoal: "マイク入力でアイデアを話し、実行助言をメモに取り込んで最初の一手を踏み出す。",
        advices: {
          quick: "右ペインのマイクを押して、今頭にあるアイデアを1つ声に出して話してみる（1分）。",
          steps: ["第2手: 「✨ スッキリ推敲」を押して文章を綺麗に整える", "第3手: 「💡 構想ストック」を押して温め棚に保存する"],
          pitfall: "最初から完璧なToDoを作ろうとしないこと。「まずは思いつきを話す」だけで合格です。",
          comments: []
        }
      }]
    }
  ];
}

function getInitialDefaultTasks() {
  return [
    {
      id: "t_init",
      sessionId: "sess_init",
      themeId: "th_init",
      category: "開発ツール",
      title: "コックピットで最初の初手を実行する",
      description: "マイク入力でアイデアを話し、実行助言をメモに取り込んで最初の一手を踏み出す。",
      startDate: formatTodayStr(),
      dueDate: "",
      hours: 4,
      actualHours: 0,
      priority: "未定",
      progressPercent: 0,
      progressNote: "",
      completed: false,
      needsAttention: true,
      createdAt: Date.now()
    }
  ];
}
