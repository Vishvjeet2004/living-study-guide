import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Redirect, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useLoadStudyState, getLoadStudyStateQueryKey, useMigrateStudyState, useSaveStudyState } from '@workspace/api-client-react';
import type { StudyState } from '@workspace/api-client-react';
import { BookOpen, BookmarkCheck, Check, ChevronRight, CircleHelp, Clock3, FileText, Layers3, Library, Menu, RotateCcw, Search, Settings2, Sparkles, X, XCircle } from 'lucide-react';
import { Draft, Flashcard, generatedDrafts, initialDrafts, Note, notes, STORAGE_KEY, StudySettings } from '@/lib/study-data';

type Activity = { day: string; count: number };
type Persisted = { drafts: Draft[]; cards: Flashcard[]; quizzes: Draft[]; sessions: number; correct: number; activity: Activity[]; settings: StudySettings };
const defaultSettings: StudySettings = { dailyGoal: 12, reducedMotion: false };
const starterState: Persisted = { drafts: initialDrafts, cards: [], quizzes: [], sessions: 0, correct: 0, activity: [], settings: defaultSettings };
const LEGACY_OWNER_KEY = `${STORAGE_KEY}-owner`;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const queryClient = new QueryClient();

function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#315647',
    colorForeground: '#283e33',
    colorMutedForeground: '#718078',
    colorDanger: '#9e5148',
    colorBackground: '#fbfaf5',
    colorInput: '#fffefb',
    colorInputForeground: '#283e33',
    colorNeutral: '#ddd9ce',
    fontFamily: "'Avenir Next', 'Segoe UI', system-ui, sans-serif",
    borderRadius: '0.8rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fbfaf5] rounded-2xl w-[440px] max-w-full overflow-hidden border border-[#e5dfd2]',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#2a4035] font-semibold',
    headerSubtitle: 'text-[#718078]',
    socialButtonsBlockButtonText: 'text-[#354a3d] font-semibold',
    formFieldLabel: 'text-[#52645a]',
    footerActionLink: 'text-[#315647] font-semibold',
    footerActionText: 'text-[#718078]',
    dividerText: 'text-[#718078]',
    identityPreviewEditButton: 'text-[#315647]',
    formFieldSuccessText: 'text-[#52735c]',
    alertText: 'text-[#9e5148]',
    logoBox: 'rounded-xl overflow-hidden',
    logoImage: 'object-contain',
    socialButtonsBlockButton: 'border-[#ddd9ce] bg-[#fffefb] hover:bg-[#f0eee5]',
    formButtonPrimary: 'bg-[#315647] hover:bg-[#264638] text-[#f4f2e9]',
    formFieldInput: 'border-[#ddd9ce] bg-[#fffefb] text-[#283e33]',
    footerAction: 'border-t border-[#ece7dd]',
    dividerLine: 'bg-[#e5dfd2]',
    alert: 'border-[#e5c8c0] bg-[#fbefec]',
    otpCodeFieldInput: 'border-[#ddd9ce] bg-[#fffefb] text-[#283e33]',
    formFieldRow: 'text-[#52645a]',
    main: 'text-[#283e33]',
  },
};

const navItems = [
  { href: '/notes', label: 'Study notes', icon: FileText },
  { href: '/review', label: 'Review queue', icon: BookmarkCheck },
  { href: '/flashcards', label: 'Flashcard library', icon: Library },
  { href: '/practice', label: 'Practice', icon: RotateCcw },
  { href: '/progress', label: 'Your progress', icon: Layers3 },
];

function readSaved(storageKey = STORAGE_KEY): Persisted {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return starterState;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return {
      drafts: Array.isArray(parsed.drafts) ? parsed.drafts : initialDrafts,
      cards: Array.isArray(parsed.cards) ? parsed.cards : [],
      quizzes: Array.isArray(parsed.quizzes) ? parsed.quizzes : [],
      sessions: Number(parsed.sessions) || 0,
      correct: Number(parsed.correct) || 0,
      activity: Array.isArray(parsed.activity) ? parsed.activity : [],
      settings: { ...defaultSettings, ...(parsed.settings || {}) },
    };
  } catch { return starterState; }
}
function readLegacyPresence() {
  return localStorage.getItem(STORAGE_KEY) !== null;
}
function writeAccountBackup(userId: string, state: StudyState) {
  try {
    localStorage.setItem(`${STORAGE_KEY}:user:${encodeURIComponent(userId)}`, JSON.stringify(state));
  } catch {
    // The server remains the source of truth if browser storage is unavailable.
  }
}
const todayKey = () => new Date().toISOString().slice(0, 10);
const formatDay = (date: Date) => date.toLocaleDateString('en-US', { weekday: 'short' });

function StudyGuide() {
  const [location, setLocation] = useLocation();
  const { signOut } = useClerk();
  const [data, setData] = useState<Persisted>(starterState);
  const [hydrated, setHydrated] = useState(false);
  const [importChoiceOpen, setImportChoiceOpen] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [editingDraft, setEditingDraft] = useState<Draft | null>(null);
  const [search, setSearch] = useState('');
  const [generated, setGenerated] = useState(false);
  const [practiceIndex, setPracticeIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizSelection, setQuizSelection] = useState<number | null>(null);
  const [quizChecked, setQuizChecked] = useState(false);

  const { userId } = useAuth();
  const studyQuery = useLoadStudyState({
    query: { enabled: Boolean(userId), queryKey: getLoadStudyStateQueryKey(), retry: false },
  });
  const migration = useMigrateStudyState();
  const saveStudyState = useSaveStudyState();
  const lastSaved = useRef('');
  const migrationAttempted = useRef(false);
  const migrationPlan = useRef<{ state: Persisted; importedLegacy: boolean } | null>(null);

  const migrateState = useCallback((state: Persisted, importedLegacy: boolean) => {
    if (!userId || migrationAttempted.current) return;
    migrationAttempted.current = true;
    migrationPlan.current = { state, importedLegacy };
    setImportChoiceOpen(false);
    setSyncError('');
    migration.mutate({ data: { state: state as StudyState } }, {
      onSuccess: response => {
        if (importedLegacy && response.migrated && !localStorage.getItem(LEGACY_OWNER_KEY)) {
          try {
            localStorage.setItem(LEGACY_OWNER_KEY, userId);
          } catch {
            // Migration has succeeded; inability to mark the legacy copy does not undo it.
          }
        }
        writeAccountBackup(userId, response.state);
        setData(response.state as Persisted);
        lastSaved.current = JSON.stringify(response.state);
        migrationPlan.current = null;
        migrationAttempted.current = false;
        setHydrated(true);
        setSyncError('');
      },
      onError: () => {
        migrationAttempted.current = false;
        setSyncError('Your study space could not be initialized on the server. Retry to continue syncing.');
      },
    });
  }, [migration.mutate, userId]);

  useEffect(() => {
    if (!userId || !studyQuery.isSuccess || hydrated || migrationPlan.current) return;
    if (studyQuery.data.state) {
      const serverState = studyQuery.data.state as Persisted;
      setData(serverState);
      lastSaved.current = JSON.stringify(serverState);
      writeAccountBackup(userId, studyQuery.data.state);
      setHydrated(true);
      return;
    }
    const owner = localStorage.getItem(LEGACY_OWNER_KEY);
    const accountBackupKey = `${STORAGE_KEY}:user:${encodeURIComponent(userId)}`;
    const hasAccountBackup = localStorage.getItem(accountBackupKey) !== null;
    if (owner === userId) {
      const hasLegacy = readLegacyPresence();
      migrateState(
        hasAccountBackup ? readSaved(accountBackupKey) : hasLegacy ? readSaved() : starterState,
        !hasAccountBackup && hasLegacy,
      );
      return;
    }
    if (owner) {
      migrateState(hasAccountBackup ? readSaved(accountBackupKey) : starterState, false);
      return;
    }
    if (hasAccountBackup) {
      migrateState(readSaved(accountBackupKey), false);
      return;
    }
    if (readLegacyPresence()) {
      setImportChoiceOpen(true);
      return;
    }
    migrateState(starterState, false);
  }, [userId, studyQuery.isSuccess, studyQuery.data, hydrated, migrateState]);

  useEffect(() => {
    if (!hydrated || saveStudyState.isPending) return;
    const serialized = JSON.stringify(data);
    if (serialized === lastSaved.current) return;
    const timeout = window.setTimeout(() => {
      saveStudyState.mutate({ data: { state: data as StudyState } }, {
        onSuccess: response => {
          lastSaved.current = JSON.stringify(response.state);
          if (userId) writeAccountBackup(userId, response.state);
          setSyncError('');
        },
        onError: () => setSyncError('Your latest changes are not synced. Retry when your connection is ready.'),
      });
    }, 450);
    return () => window.clearTimeout(timeout);
  }, [data, hydrated, saveStudyState.isPending, saveStudyState.mutate, lastSaved, userId]);

  useEffect(() => { document.documentElement.classList.toggle('dark', false); }, []);
  useEffect(() => { setMenuOpen(false); setSearch(''); }, [location]);
  const update = (patch: Partial<Persisted>) => setData(current => ({ ...current, ...patch }));
  const retrySync = () => {
    if (studyQuery.isError) {
      void studyQuery.refetch();
      return;
    }
    if (!hydrated && migrationPlan.current) {
      const plan = migrationPlan.current;
      migrationAttempted.current = false;
      setSyncError('');
      migrateState(plan.state, plan.importedLegacy);
      return;
    }
    saveStudyState.mutate({ data: { state: data as StudyState } }, {
      onSuccess: response => {
        lastSaved.current = JSON.stringify(response.state);
        if (userId) writeAccountBackup(userId, response.state);
        setSyncError('');
      },
      onError: () => setSyncError('Your latest changes are not synced. Retry when your connection is ready.'),
    });
  };
  const todayActivity = data.activity.find(item => item.day === todayKey())?.count || 0;
  const pageTitle = navItems.find(item => item.href === location)?.label || 'Study notes';
  const noteById = (id: string) => notes.find(note => note.id === id);
  const setSetting = (key: keyof StudySettings, value: number | boolean) => update({ settings: { ...data.settings, [key]: value } });

  const approveDraft = (draft: Draft) => {
    if (draft.kind === 'flashcard') {
      const card: Flashcard = { id: `approved-${draft.id}`, topic: draft.topic, prompt: draft.prompt, answer: draft.answer, sourceNoteId: draft.sourceNoteId, excerpt: draft.excerpt };
      update({ cards: data.cards.some(existing => existing.id === card.id) ? data.cards : [...data.cards, card], drafts: data.drafts.filter(item => item.id !== draft.id) });
    } else update({ quizzes: data.quizzes.some(existing => existing.id === draft.id) ? data.quizzes : [...data.quizzes, draft], drafts: data.drafts.filter(item => item.id !== draft.id) });
  };
  const discardDraft = (draft: Draft) => update({ drafts: data.drafts.filter(item => item.id !== draft.id) });
  const saveDraft = (draft: Draft) => { update({ drafts: data.drafts.map(item => item.id === draft.id ? draft : item) }); setEditingDraft(null); };
  const addGenerated = () => {
    const exists = new Set([...data.drafts.map(item => item.id), ...data.cards.map(item => item.id.replace('approved-', '')), ...data.quizzes.map(item => item.id)]);
    const additions = generatedDrafts.filter(item => !exists.has(item.id));
    update({ drafts: [...data.drafts, ...additions] });
    setGenerated(true);
  };
  const logPractice = (isCorrect: boolean) => {
    const current = data.activity.find(entry => entry.day === todayKey())?.count || 0;
    const activity = data.activity.filter(entry => entry.day !== todayKey()).concat({ day: todayKey(), count: current + 1 });
    update({ sessions: data.sessions + 1, correct: data.correct + (isCorrect ? 1 : 0), activity });
  };
  const resetLocal = () => {
    if (window.confirm('Reset this browser’s study queue, approvals, and progress to the original demo?')) {
      setData({ ...starterState, settings: { ...defaultSettings } });
    }
  };
  const cards = useMemo(() => data.cards.filter(card => `${card.prompt} ${card.answer} ${card.topic}`.toLowerCase().includes(search.toLowerCase())), [data.cards, search]);
  const isKnown = navItems.some(item => item.href === location);
  const syncLabel = syncError ? 'Sync needs attention' : !hydrated ? migration.isPending ? 'Preparing your account' : 'Loading account' : saveStudyState.isPending ? 'Saving…' : 'Synced to your account';

  return (
    <div className="app-shell">
      {menuOpen && <button aria-label="Close navigation" className="mobile-overlay show" onClick={() => setMenuOpen(false)} data-testid="button-close-navigation" />}
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="brand"><div className="brand-mark"><BookOpen size={19} /></div><div><div className="brand-name">Living Study Guide</div><div className="brand-sub">C# · ASP.NET Core</div></div></div>
        <div className="nav-label">Your workspace</div>
        <nav className="nav-list" aria-label="Main navigation">
          {navItems.map(item => {
            const Icon = item.icon;
            const active = location === item.href;
            return <Link key={item.href} href={item.href} className={`nav-link ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined} data-testid={`link-nav-${item.href.slice(1)}`}><Icon size={17} strokeWidth={1.8} /><span>{item.label}</span>{item.href === '/review' && data.drafts.length > 0 && <span className="nav-count">{data.drafts.length}</span>}</Link>;
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-note"><strong><span className={`sync-dot ${syncError ? 'sync-dot-error' : ''}`} style={{ display: 'inline-block', marginRight: 7 }} />{syncLabel}</strong>Your private notes and progress are saved to your account.</div>
          {syncError && <button className="sync-retry" onClick={retrySync} data-testid="button-retry-sync">Retry sync</button>}
          <button className="sign-out-button" onClick={() => void signOut({ redirectUrl: basePath || '/' })} data-testid="button-sign-out">Sign out</button>
          <div className="sidebar-footer">A QUIETER WAY TO LEARN</div>
        </div>
      </aside>
      <main className="main-area">
        <header className="mobile-header"><button className="menu-button" aria-label="Open navigation" onClick={() => setMenuOpen(true)} data-testid="button-open-navigation"><Menu size={21} /></button><div className="brand-mark" style={{ width: 30, height: 30 }}><BookOpen size={16} /></div><span className="mobile-brand">Living Study Guide</span></header>
        <div className="topbar"><div className="crumb">LEARNING SPACE <span style={{ padding: '0 7px', color: '#b5b9ae' }}>/</span> {pageTitle.toUpperCase()}</div><div className="topbar-right"><span className={`sync-dot ${syncError ? 'sync-dot-error' : ''}`} />{syncLabel}</div></div>
        {studyQuery.isLoading || (!hydrated && migration.isPending) ? <div className="content"><div className="surface loading-state" aria-label="Loading your study space"><div className="skeleton-line wide" /><div className="skeleton-line" /><div className="skeleton-grid"><span /><span /></div></div></div> :
        studyQuery.isError || syncError && !hydrated ? <div className="content"><div className="surface empty-state"><div className="empty-mark"><BookOpen /></div><h3>Your study space is waiting</h3><p>{syncError || 'We could not load your saved study state. Your browser copy is still intact.'}</p><button className="button primary" onClick={retrySync} data-testid="button-retry-load">Retry</button></div></div> :
        !hydrated ? <div className="content"><div className="surface loading-state" aria-label="Preparing your study space"><div className="skeleton-line wide" /><div className="skeleton-line" /></div></div> :
        !isKnown ? <div className="content"><div className="surface empty-state"><div className="empty-mark"><BookOpen /></div><h3>That page isn't in your guide</h3><p>Head back to your study notes and choose where to begin.</p><Link className="button primary" href="/notes">Open study notes</Link></div></div> :
          <div className="content">
            {location === '/notes' && <NotesPage onOpen={setSelectedNote} onGenerate={addGenerated} generated={generated} />}
            {location === '/review' && <ReviewPage drafts={data.drafts} onApprove={approveDraft} onDiscard={discardDraft} onEdit={setEditingDraft} onGenerate={addGenerated} />}
            {location === '/flashcards' && <FlashcardsPage cards={cards} query={search} onQuery={setSearch} />}
            {location === '/practice' && <PracticePage cards={data.cards} quizzes={data.quizzes} index={practiceIndex} setIndex={setPracticeIndex} flipped={flipped} setFlipped={setFlipped} quizIndex={quizIndex} setQuizIndex={setQuizIndex} selection={quizSelection} setSelection={setQuizSelection} checked={quizChecked} setChecked={setQuizChecked} onLog={logPractice} />}
            {location === '/progress' && <ProgressPage data={data} todayActivity={todayActivity} setSetting={setSetting} reset={resetLocal} />}
          </div>}
      </main>
      {selectedNote && <NoteDialog note={selectedNote} onClose={() => setSelectedNote(null)} />}
      {editingDraft && <EditDraftDialog draft={editingDraft} onClose={() => setEditingDraft(null)} onSave={saveDraft} />}
      {importChoiceOpen && <div className="modal-backdrop" role="presentation"><section className="surface modal import-confirm" role="dialog" aria-modal="true" aria-labelledby="import-legacy-title"><div className="eyebrow">One-time browser import</div><h2 className="modal-title" id="import-legacy-title">Choose how to begin</h2><p className="import-copy">Study data from this browser is available to import. You can bring it into this account, or start with the regular demo set. The browser data will not be changed.</p><div className="import-actions"><button className="button" onClick={() => migrateState(starterState, false)} data-testid="button-start-demo">Start with demo</button><button className="button primary" onClick={() => {
        const owner = localStorage.getItem(LEGACY_OWNER_KEY);
        if (owner && owner !== userId) {
          migrateState(starterState, false);
          return;
        }
        const hasLegacy = readLegacyPresence();
        migrateState(hasLegacy ? readSaved() : starterState, hasLegacy);
      }} data-testid="button-import-legacy">Import browser data</button></div></section></div>}
    </div>
  );
}

function NotesPage({ onOpen, onGenerate, generated }: { onOpen: (note: Note) => void; onGenerate: () => void; generated: boolean }) {
  return <>
    <div className="page-head"><div><div className="eyebrow">A good place to begin</div><h1 className="page-title">Study notes</h1><p className="page-intro">A small, source-grounded reference for the ideas behind C# and ASP.NET Core MVC. Read a note, then shape it into something you can recall.</p></div></div>
    <div className="feature-band"><div><div style={{ fontWeight: 600, fontSize: 13, color: '#385344' }}>Turn the notes into review material</div><p>Build an editable set of flashcard and quiz drafts, each tied to its exact source excerpt.</p></div><button className="button primary" onClick={onGenerate} data-testid="button-generate-drafts"><Sparkles size={15} />{generated ? 'Add any new drafts' : 'Generate local drafts'}</button></div>
    <div className="note-grid">{notes.map((note, index) => <article className="surface note-card" key={note.id} data-testid={`card-note-${note.id}`}><div className="note-top"><span className="tag">{note.topic}</span><span className="note-num">0{index + 1} / {note.readTime}</span></div><h2>{note.title}</h2><p>{note.body.split('\n\n')[0]}</p><div className="note-footer"><span className="muted mono" style={{ fontSize: 10 }}>DEMO NOTE · LOCAL REFERENCE</span><button className="text-action" onClick={() => onOpen(note)} data-testid={`button-read-note-${note.id}`}>Read note <ChevronRight size={14} /></button></div></article>)}</div>
  </>;
}

function NoteDialog({ note, onClose }: { note: Note; onClose: () => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="surface modal" role="dialog" aria-modal="true" aria-labelledby="note-dialog-title"><div className="modal-head"><div><div className="eyebrow">{note.topic} · {note.readTime} read</div><h2 className="modal-title" id="note-dialog-title">{note.title}</h2></div><button className="close-button" aria-label="Close note" onClick={onClose} data-testid="button-close-note"><X size={20} /></button></div><div className="note-body">{note.body}</div><div style={{ marginTop: 22, display: 'flex', justifyContent: 'flex-end' }}><button className="button primary" onClick={onClose}>Done reading</button></div></section></div>;
}

function ReviewPage({ drafts, onApprove, onDiscard, onEdit, onGenerate }: { drafts: Draft[]; onApprove: (draft: Draft) => void; onDiscard: (draft: Draft) => void; onEdit: (draft: Draft) => void; onGenerate: () => void }) {
  return <>
    <div className="page-head"><div><div className="eyebrow">Make it yours before it sticks</div><h1 className="page-title">Review queue</h1><p className="page-intro">These drafts are starting points, not answers from a service. Check the source, edit what you need, then approve or discard.</p></div></div>
    {drafts.length === 0 ? <div className="surface empty-state"><div className="empty-mark"><Check size={20} /></div><h3>Your queue is clear</h3><p>Every draft has been reviewed. You can create another set from the demo notes whenever you are ready.</p><button className="button primary" onClick={onGenerate} data-testid="button-generate-empty"><Sparkles size={15} />Generate local drafts</button></div> :
      <><div className="search-row"><div className="mono muted" style={{ fontSize: 11 }}>{drafts.length} DRAFT{drafts.length === 1 ? '' : 'S'} · APPROVAL IS ALWAYS YOURS</div><button className="button small" onClick={onGenerate} data-testid="button-generate-more"><Sparkles size={14} />Generate from notes</button></div>
      <div className="draft-list">{drafts.map(draft => <DraftCard key={draft.id} draft={draft} onApprove={onApprove} onDiscard={onDiscard} onEdit={onEdit} />)}</div></>}
  </>;
}

function DraftCard({ draft, onApprove, onDiscard, onEdit }: { draft: Draft; onApprove: (draft: Draft) => void; onDiscard: (draft: Draft) => void; onEdit: (draft: Draft) => void }) {
  return <article className="surface draft-card" data-testid={`card-draft-${draft.id}`}>
    <div className="draft-head"><div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><span className="tag">{draft.kind === 'flashcard' ? 'Flashcard' : 'Multiple choice'}</span><span className="muted" style={{ fontSize: 11 }}>{draft.topic}</span></div><div className="draft-actions"><button className="button small" onClick={() => onEdit(draft)} data-testid={`button-edit-${draft.id}`}>Edit draft</button><button className="button small primary" onClick={() => onApprove(draft)} data-testid={`button-approve-${draft.id}`}><Check size={13} />Approve</button><button className="button small ghost danger" onClick={() => onDiscard(draft)} data-testid={`button-discard-${draft.id}`}><XCircle size={13} />Discard</button></div></div>
    <h3 className="draft-content">{draft.prompt}</h3>
    {draft.kind === 'quiz' && <div className="choice-list">{draft.choices.map((choice, i) => <div key={choice}>{String.fromCharCode(65 + i)}. {choice}{i === draft.correctIndex ? <span style={{ color: '#608168', marginLeft: 7 }}>· answer</span> : null}</div>)}</div>}
    <p className="draft-answer"><strong style={{ color: '#496351' }}>Answer:</strong> {draft.answer}</p>
    <div className="eyebrow" style={{ marginBottom: 7 }}>Exact excerpt · {noteLabel(draft.sourceNoteId)}</div><div className="excerpt">{draft.excerpt}</div>
  </article>;
}
function noteLabel(id: string) { return notes.find(note => note.id === id)?.title || 'Study note'; }

function EditDraftDialog({ draft, onClose, onSave }: { draft: Draft; onClose: () => void; onSave: (draft: Draft) => void }) {
  const [form, setForm] = useState<Draft>(draft);
  const set = (key: keyof Draft, value: string) => setForm(current => ({ ...current, [key]: value }));
  const submit = (event: FormEvent) => { event.preventDefault(); onSave({ ...form, choices: form.kind === 'quiz' ? String(form.choices.join('\n')).split('\n').map(item => item.trim()).filter(Boolean) : [], correctIndex: Math.min(form.correctIndex, Math.max(0, String(form.choices.join('\n')).split('\n').filter(item => item.trim()).length - 1)) }); };
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><form className="surface modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="edit-title"><div className="modal-head"><div><div className="eyebrow">Review before approval</div><h2 className="modal-title" id="edit-title">Edit draft</h2></div><button type="button" className="close-button" aria-label="Close editor" onClick={onClose}><X size={20} /></button></div>
    <div className="field"><label htmlFor="draft-prompt">Question / prompt</label><textarea id="draft-prompt" className="input textarea" value={form.prompt} onChange={e => set('prompt', e.target.value)} required data-testid="input-draft-prompt" /></div>
    <div className="field"><label htmlFor="draft-answer">Answer</label><textarea id="draft-answer" className="input textarea" value={form.answer} onChange={e => set('answer', e.target.value)} required data-testid="input-draft-answer" /></div>
    {form.kind === 'quiz' && <><div className="field"><label htmlFor="draft-choices">Choices, one per line</label><textarea id="draft-choices" className="input textarea" value={form.choices.join('\n')} onChange={e => setForm(current => ({ ...current, choices: e.target.value.split('\n'), correctIndex: current.correctIndex }))} required data-testid="input-draft-choices" /></div><div className="field"><label htmlFor="draft-correct">Correct choice number (1–{form.choices.length})</label><input id="draft-correct" className="input" type="number" min={1} max={form.choices.length} value={form.correctIndex + 1} onChange={e => setForm(current => ({ ...current, correctIndex: Math.max(0, Number(e.target.value) - 1) }))} /></div></>}
    <div className="field"><label>Source excerpt · read-only</label><div className="excerpt">{form.excerpt}</div></div>
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}><button type="button" className="button" onClick={onClose}>Cancel</button><button className="button primary" type="submit" data-testid="button-save-draft">Save edits</button></div>
  </form></div>;
}

function FlashcardsPage({ cards, query, onQuery }: { cards: Flashcard[]; query: string; onQuery: (value: string) => void }) {
  return <>
    <div className="page-head"><div><div className="eyebrow">Only what you chose to keep</div><h1 className="page-title">Flashcard library</h1><p className="page-intro">Approved cards, grounded in the notes. Your review queue is where drafts become part of this collection.</p></div></div>
    <div className="search-row"><div className="search-wrap"><Search size={15} /><input className="input" type="search" aria-label="Search approved flashcards" placeholder="Search cards or topics…" value={query} onChange={e => onQuery(e.target.value)} data-testid="input-search-flashcards" /></div><span className="mono muted" style={{ fontSize: 11 }}>{cards.length} {cards.length === 1 ? 'CARD' : 'CARDS'}</span></div>
    {cards.length === 0 ? <div className="surface empty-state"><div className="empty-mark"><Library size={20} /></div><h3>{query ? 'No cards match that search' : 'Your library is ready for its first card'}</h3><p>{query ? 'Try a different keyword or clear the search.' : 'Approve a flashcard draft in the review queue. Only approved flashcards appear here.'}</p>{query ? <button className="button" onClick={() => onQuery('')}>Clear search</button> : <Link href="/review" className="button primary">Go to review queue</Link>}</div> :
       <div className="note-grid">{cards.map((card, index) => <article className="surface note-card" key={card.id} data-testid={`card-library-${card.id}`}><div className="note-top"><span className="tag">{card.topic}</span><span className="note-num">CARD {String(index + 1).padStart(2, '0')}</span></div><h2>{card.prompt}</h2><p>{card.answer}</p><details className="source-details"><summary>Exact source excerpt · {noteLabel(card.sourceNoteId)}</summary><div className="excerpt">{card.excerpt}</div></details><div className="note-footer"><span className="muted mono" style={{ fontSize: 10 }}>APPROVED · {noteLabel(card.sourceNoteId)}</span><span className="text-action" aria-label="Source excerpt verified"><Check size={14} />Source checked</span></div></article>)}</div>}
  </>;
}

function PracticePage({ cards, quizzes, index, setIndex, flipped, setFlipped, quizIndex, setQuizIndex, selection, setSelection, checked, setChecked, onLog }: { cards: Flashcard[]; quizzes: Draft[]; index: number; setIndex: (value: number) => void; flipped: boolean; setFlipped: (value: boolean) => void; quizIndex: number; setQuizIndex: (value: number) => void; selection: number | null; setSelection: (value: number | null) => void; checked: boolean; setChecked: (value: boolean) => void; onLog: (correct: boolean) => void }) {
  const card = cards.length ? cards[index % cards.length] : undefined;
  const quiz = quizzes.length ? quizzes[quizIndex % quizzes.length] : undefined;
  const [quizFinished, setQuizFinished] = useState(false);
  const nextCard = (remembered: boolean) => { if (card) onLog(remembered); setIndex((index + 1) % Math.max(cards.length, 1)); setFlipped(false); };
  const checkQuiz = () => { if (selection !== null && quiz) { setChecked(true); onLog(selection === quiz.correctIndex); } };
  const nextQuiz = () => { if (quizIndex + 1 >= quizzes.length) setQuizFinished(true); else setQuizIndex(quizIndex + 1); setSelection(null); setChecked(false); };
  const restartQuiz = () => { setQuizIndex(0); setQuizFinished(false); setSelection(null); setChecked(false); };
  return <>
    <div className="page-head"><div><div className="eyebrow">Small sessions count</div><h1 className="page-title">Practice</h1><p className="page-intro">Recall first, then reveal. Everything here comes from flashcards and quiz questions you approved.</p></div></div>
    <div className="practice-card surface">
      <div className="eyebrow">FLASHCARD RECALL {card ? `· ${index + 1} OF ${cards.length}` : ''}</div>
      {!card ? <div className="empty-state" style={{ padding: '36px 10px' }}><div className="empty-mark"><BookOpen size={19} /></div><h3>No cards to practice yet</h3><p>Review the drafts, approve a few flashcards, then your practice set will be ready.</p><Link className="button primary" href="/review">Review drafts</Link></div> :
         <><div className="practice-question">{flipped ? card.answer : card.prompt}</div>{flipped && <div className="flip-answer">From {noteLabel(card.sourceNoteId)} · answer revealed</div>}<details className="source-details"><summary>Exact source excerpt · {noteLabel(card.sourceNoteId)}</summary><div className="excerpt">{card.excerpt}</div></details><div className="practice-controls"><button className="button" onClick={() => setFlipped(!flipped)} data-testid="button-flip-card">{flipped ? 'Show question' : 'Reveal answer'}</button>{flipped && <><button className="button" onClick={() => nextCard(false)} data-testid="button-again-card"><RotateCcw size={14} />Practice again</button><button className="button primary" onClick={() => nextCard(true)} data-testid="button-know-card"><Check size={14} />Got it</button></>}</div><div className="progress-track"><div className="progress-fill" style={{ width: `${((index + 1) / cards.length) * 100}%` }} /></div></>}
    </div>
    <div style={{ marginTop: 34, marginBottom: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><div><div className="eyebrow">A short check-in</div><h2 className="section-heading" style={{ marginTop: 5 }}>Multiple-choice quiz</h2></div><span className="mono muted" style={{ fontSize: 10 }}>{quizzes.length} APPROVED</span></div>
    <div className="surface panel">
      {!quiz ? <div className="empty-state" style={{ padding: '25px 10px' }}><div className="empty-mark"><CircleHelp size={19} /></div><h3>No quiz questions yet</h3><p>Approve a multiple-choice draft in Review Queue to practice here.</p><Link className="button" href="/review">Open review queue</Link></div> :
      quizFinished ? <div className="empty-state" style={{ padding: '25px 10px' }}><div className="empty-mark"><Check size={19} /></div><h3>That’s the set</h3><p>You worked through {quizzes.length} {quizzes.length === 1 ? 'question' : 'questions'}. Take another pass when you like.</p><button className="button primary" onClick={restartQuiz} data-testid="button-restart-quiz">Start again</button></div> :
       <><div className="eyebrow">QUESTION {quizIndex + 1} OF {quizzes.length} · {quiz.topic}</div><h3 className="practice-question" style={{ fontSize: 25, margin: '18px auto' }}>{quiz.prompt}</h3><div>{quiz.choices.map((choice, choiceIndex) => { const resultClass = checked && choiceIndex === quiz.correctIndex ? 'correct' : checked && choiceIndex === selection ? 'incorrect' : ''; return <button key={`${quiz.id}-${choiceIndex}`} disabled={checked} className={`quiz-option ${selection === choiceIndex ? 'selected' : ''} ${resultClass}`} onClick={() => setSelection(choiceIndex)} data-testid={`button-quiz-option-${choiceIndex}`}>{String.fromCharCode(65 + choiceIndex)}. &nbsp;{choice}</button>; })}</div><details className="source-details"><summary>Exact source excerpt · {noteLabel(quiz.sourceNoteId)}</summary><div className="excerpt">{quiz.excerpt}</div></details>
      {checked && <div className="quiz-feedback">{selection === quiz.correctIndex ? 'That’s right. Nice recall.' : `Not quite. The answer is ${quiz.answer}.`}</div>}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>{checked ? <button className="button primary" onClick={nextQuiz} data-testid="button-next-question">{quizIndex + 1 >= quizzes.length ? 'Finish set' : 'Next question'}<ChevronRight size={14} /></button> : <button className="button primary" disabled={selection === null} onClick={checkQuiz} data-testid="button-check-answer">Check answer</button>}</div></>}
    </div>
  </>;
}

function ProgressPage({ data, todayActivity, setSetting, reset }: { data: Persisted; todayActivity: number; setSetting: (key: keyof StudySettings, value: number | boolean) => void; reset: () => void }) {
  const accuracy = data.sessions ? Math.round((data.correct / data.sessions) * 100) : 0;
  const weekly = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(); date.setDate(date.getDate() - (6 - index));
    const key = date.toISOString().slice(0, 10);
    return { label: formatDay(date), count: data.activity.find(item => item.day === key)?.count || 0, today: index === 6 };
  });
  const max = Math.max(data.settings.dailyGoal, ...weekly.map(item => item.count), 1);
  return <>
    <div className="page-head"><div><div className="eyebrow">Notice the practice, not the pressure</div><h1 className="page-title">Your progress</h1><p className="page-intro">A quiet view of your study rhythm. Your practice is saved to your account, and there is no streak to lose.</p></div></div>
    <div className="stat-grid">
      <div className="surface stat-card"><div className="stat-label">Practice reps</div><div className="stat-number" data-testid="text-progress-reps">{data.sessions}</div><div className="stat-foot">logged to your account</div></div>
      <div className="surface stat-card"><div className="stat-label">Recall accuracy</div><div className="stat-number">{data.sessions ? `${accuracy}%` : '—'}</div><div className="stat-foot">{data.sessions ? `${data.correct} remembered on first check` : 'appears after practice'}</div></div>
      <div className="surface stat-card"><div className="stat-label">Cards approved</div><div className="stat-number">{data.cards.length}</div><div className="stat-foot">in your flashcard library</div></div>
      <div className="surface stat-card"><div className="stat-label">Today</div><div className="stat-number">{todayActivity}<span style={{ fontSize: 14, color: '#88958a' }}> / {data.settings.dailyGoal}</span></div><div className="stat-foot">practice reps toward your goal</div></div>
    </div>
    <div className="dash-grid">
      <section className="surface panel"><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}><h2 className="section-heading">A week of showing up</h2><span className="mono muted" style={{ fontSize: 9 }}>REPS</span></div><div className="week-bars" aria-label="Practice activity for the last seven days">{weekly.map(day => <div className="bar-group" key={day.label}><div className={`bar ${day.today ? 'today' : ''}`} title={`${day.count} practice reps`} style={{ height: `${Math.max(day.count ? 14 : 4, day.count / max * 100)}%` }} /><span className="bar-day">{day.label}</span></div>)}</div><div className="activity-list"><div className="activity-row"><span className="activity-dot" />Your progress follows your account across sessions.</div><div className="activity-row"><Clock3 size={14} color="#8a9a8c" />Short, steady recall sessions make a good rhythm.</div></div></section>
      <section className="surface panel"><div className="eyebrow">A few preferences</div><h2 className="section-heading" style={{ marginTop: 7, marginBottom: 20 }}>Make this space yours</h2><div className="field"><label htmlFor="daily-goal">Daily practice goal</label><select id="daily-goal" className="input" value={data.settings.dailyGoal} onChange={e => setSetting('dailyGoal', Number(e.target.value))} data-testid="select-daily-goal"><option value={5}>5 reps · light</option><option value={8}>8 reps · steady</option><option value={12}>12 reps · focused</option><option value={20}>20 reps · deep work</option></select></div><div style={{ paddingTop: 7, borderTop: '1px solid #ece7dd', marginTop: 11 }}><div className="activity-row" style={{ justifyContent: 'space-between' }}><span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Settings2 size={14} />Learning preferences</span><span className="muted">Synced</span></div></div><div style={{ borderTop: '1px solid #ece7dd', marginTop: 18, paddingTop: 17 }}><div className="field"><label>Account study data</label><p className="muted" style={{ fontSize: 11, lineHeight: 1.6, margin: 0 }}>Reset approvals, drafts, and practice history to the original demo set. Demo notes remain available.</p></div><button className="button small danger" onClick={reset} data-testid="button-reset-local-data">Reset demo progress</button></div></section>
    </div>
  </>;
}

function PublicHome() {
  return <main className="public-home">
    <header className="public-nav"><Link href="/" className="brand public-brand"><span className="brand-mark"><BookOpen size={19} /></span><span><span className="brand-name">Living Study Guide</span><span className="brand-sub">C# · ASP.NET Core</span></span></Link><div className="public-links"><Link className="text-action" href="/sign-in">Sign in</Link><Link className="button primary" href="/sign-up">Create account <ChevronRight size={14} /></Link></div></header>
    <section className="public-hero"><div className="public-copy"><div className="eyebrow">A quieter way to learn</div><h1>Make what you learn<br /><em>easy to return to.</em></h1><p>A private study space for C# and ASP.NET Core. Read clear notes, shape your own review cards, and keep your progress close at hand.</p><div className="public-cta"><Link className="button primary" href="/sign-up">Start your study space <ChevronRight size={15} /></Link><Link className="text-action" href="/sign-in">Already have an account <ChevronRight size={14} /></Link></div><div className="public-proof"><span className="sync-dot" />Your drafts and progress stay yours, synced to your account.</div></div><div className="public-art" aria-hidden="true"><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-note"><span className="tag">A note to keep</span><strong>Learn the shape<br />of the idea.</strong><span className="art-rule" /><small>READ · RECALL · RETURN</small></div><div className="art-index">01 — 05<br />STUDY NOTES</div></div></section>
    <section className="public-principles"><div><span className="mono muted">01 / GROUNDED</span><h2>Start with the source.</h2><p>Static, carefully written notes give every review item a clear place to come from.</p></div><div><span className="mono muted">02 / YOURS</span><h2>Choose what stays.</h2><p>Edit, approve, or discard each draft. Your library only contains cards you decided to keep.</p></div><div><span className="mono muted">03 / STEADY</span><h2>Practice without pressure.</h2><p>Short recall sessions build a useful rhythm, with progress saved privately to your account.</p></div></section>
    <footer className="public-footer"><span>Living Study Guide</span><span>For the things worth learning twice.</span></footer>
  </main>;
}

function HomeRoute() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <div className="auth-loading" />;
  return isSignedIn ? <Redirect to="/notes" /> : <PublicHome />;
}

function ProtectedStudyRoute() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  if (!isLoaded) return <div className="auth-loading" />;
  return isSignedIn ? <StudyGuide key={userId} /> : <Redirect to="/" />;
}

function SignInPage() {
  return <div className="auth-page"><Link href="/" className="auth-back"><BookOpen size={17} /> Living Study Guide</Link><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></div>;
}

function SignUpPage() {
  return <div className="auth-page"><Link href="/" className="auth-back"><BookOpen size={17} /> Living Study Guide</Link><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></div>;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const previousUserRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (previousUserRef.current !== undefined && previousUserRef.current !== userId) client.clear();
      previousUserRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, client]);
  return null;
}

function ClerkRouter() {
  const [, setLocation] = useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance}
    signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}
    localization={{ signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to return to your study space' } }, signUp: { start: { title: 'Create your study space', subtitle: 'Keep your notes and progress together' } } }}
    routerPush={to => setLocation(stripBase(to))}
    routerReplace={to => setLocation(stripBase(to), { replace: true })}>
    <QueryClientProvider client={queryClient}>
      <ClerkQueryClientCacheInvalidator />
      <Switch>
        <Route path="/" component={HomeRoute} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route path="/notes" component={ProtectedStudyRoute} />
        <Route path="/review" component={ProtectedStudyRoute} />
        <Route path="/flashcards" component={ProtectedStudyRoute} />
        <Route path="/practice" component={ProtectedStudyRoute} />
        <Route path="/progress" component={ProtectedStudyRoute} />
        <Route component={ProtectedStudyRoute} />
      </Switch>
    </QueryClientProvider>
  </ClerkProvider>;
}

function App() {
  if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
  return <WouterRouter base={basePath}><ClerkRouter /></WouterRouter>;
}

export default App;
