export const meta = {
  name: 'parity-verify',
  description: 'web-mobile のパリティ検証テストを著作・実行（Flutter をオラクルに）',
  phases: [
    { title: 'Precheck', detail: '既存テストが緑なら scaffold/author を短絡（再実行 fast-path）' },
    { title: 'Scaffold', detail: 'Vitest 設定・shift シード投入・seeded /shifts 確認' },
    { title: 'Author', detail: 'new-badge / badge-store / reviewed-store / schemas を並列著作' },
    { title: 'Verify', detail: 'vitest run、合否と parity gap を報告' },
  ],
}

const WEB = '/Users/eisaki/workspace/SeeFT-fork/web-mobile'
const MOBILE = '/Users/eisaki/workspace/SeeFT-fork/mobile'

const SCAFFOLD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    steps: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { step: { type: 'string' }, ok: { type: 'boolean' }, detail: { type: 'string' } }, required: ['step', 'ok', 'detail'] } },
    shiftCardsSampleDate1: { type: 'string' },
    allThreeDaysNonEmpty: { type: 'boolean' },
  },
  required: ['steps', 'shiftCardsSampleDate1', 'allThreeDaysNonEmpty'],
}

const AUTHOR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    file: { type: 'string' },
    testCount: { type: 'number' },
    oracleRefs: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
  required: ['file', 'testCount', 'oracleRefs', 'notes'],
}

const VERIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    command: { type: 'string' },
    passed: { type: 'number' },
    failed: { type: 'number' },
    total: { type: 'number' },
    failures: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, message: { type: 'string' } }, required: ['name', 'message'] } },
    parityGaps: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { module: { type: 'string' }, description: { type: 'string' } }, required: ['module', 'description'] } },
    rawTail: { type: 'string' },
  },
  required: ['command', 'passed', 'failed', 'total', 'failures', 'parityGaps', 'rawTail'],
}

const scaffoldPrompt = [
  'You set up the test scaffold for the Next.js app at ' + WEB + '. The vitest/jsdom/vite-tsconfig-paths deps are already installed. Do exactly these steps, then return a structured result.',
  '',
  'STEP 1 — Write the file ' + WEB + '/vitest.config.ts with EXACTLY this content (between the BEGIN/END markers, do not include the markers):',
  '--- BEGIN vitest.config.ts ---',
  'import { defineConfig } from "vitest/config";',
  'import tsconfigPaths from "vite-tsconfig-paths";',
  '',
  '// 単体テストは既定で node 環境。localStorage を触る badge-store / reviewed-store の',
  '// テストはファイル先頭の // @vitest-environment jsdom コメントで jsdom に切り替える。',
  'export default defineConfig({',
  '  plugins: [tsconfigPaths()],',
  '  test: {',
  '    environment: "node",',
  '    globals: true,',
  '    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],',
  '  },',
  '});',
  '--- END vitest.config.ts ---',
  '',
  'STEP 2 — Edit ' + WEB + '/package.json: in the "scripts" object add two entries "test": "vitest run" and "test:watch": "vitest". Keep the existing dev/build/start/lint scripts. Use Read then Edit (do not overwrite the whole file).',
  '',
  'STEP 3 — Write the file ' + MOBILE + '/../postgresql/db/seed_shifts.sql (i.e. /Users/eisaki/workspace/SeeFT-fork/postgresql/db/seed_shifts.sql) with EXACTLY this content (between BEGIN/END, exclude markers):',
  '--- BEGIN seed_shifts.sql ---',
  '-- テスト/開発用 shift シード（shift-cards 検証のため）。',
  '-- 同タスクで time_id が +1 連続するスロットを 1 枚のカードにまとめる。',
  '-- time_id: id N = (N-1)*15 分。33=8:00, 37=9:00, 41=10:00。date 1/2/3=準備日/1日目/2日目。weather 1=晴れ。year 43。tasks 4/5/6=テスト1/2/3。',
  'INSERT INTO shifts (task_id, user_id, year_id, date_id, time_id, weather_id)',
  'SELECT 4, 1, 43, 1, t, 1 FROM generate_series(33, 36) AS t',
  'WHERE NOT EXISTS (SELECT 1 FROM shifts WHERE user_id=1 AND date_id=1 AND task_id=4);',
  'INSERT INTO shifts (task_id, user_id, year_id, date_id, time_id, weather_id)',
  'SELECT 5, 1, 43, 1, t, 1 FROM generate_series(41, 44) AS t',
  'WHERE NOT EXISTS (SELECT 1 FROM shifts WHERE user_id=1 AND date_id=1 AND task_id=5);',
  'INSERT INTO shifts (task_id, user_id, year_id, date_id, time_id, weather_id)',
  'SELECT 4, 2, 43, 1, t, 1 FROM generate_series(32, 37) AS t',
  'WHERE NOT EXISTS (SELECT 1 FROM shifts WHERE user_id=2 AND date_id=1 AND task_id=4);',
  'INSERT INTO shifts (task_id, user_id, year_id, date_id, time_id, weather_id)',
  'SELECT 6, 1, 43, 2, t, 1 FROM generate_series(37, 40) AS t',
  'WHERE NOT EXISTS (SELECT 1 FROM shifts WHERE user_id=1 AND date_id=2 AND task_id=6);',
  'INSERT INTO shifts (task_id, user_id, year_id, date_id, time_id, weather_id)',
  'SELECT 4, 1, 43, 3, t, 1 FROM generate_series(33, 34) AS t',
  'WHERE NOT EXISTS (SELECT 1 FROM shifts WHERE user_id=1 AND date_id=3 AND task_id=4);',
  '--- END seed_shifts.sql ---',
  '',
  'STEP 4 — Apply the seed to the running postgres container (named nutfes-seeft-db). Run this exact shell command:',
  'docker exec -i nutfes-seeft-db psql -U seeft -d seeft_db < /Users/eisaki/workspace/SeeFT-fork/postgresql/db/seed_shifts.sql',
  '',
  'STEP 5 — Verify shift-cards are now non-empty for all three days (the API runs on localhost:1234):',
  'curl -s http://localhost:1234/shift-cards/users/1/dates/1/weathers/1',
  'curl -s http://localhost:1234/shift-cards/users/1/dates/2/weathers/1',
  'curl -s http://localhost:1234/shift-cards/users/1/dates/3/weathers/1',
  'Each must return a JSON array with at least one card. Date 1 should contain task_name テスト1 with start_time 8:00 and end_time 9:00.',
  '',
  'Do NOT run vitest (no tests exist yet). Return: the list of steps with ok/detail, the date-1 shift-cards JSON sample, and whether all three days are non-empty.',
].join('\n')

const newBadgePrompt = [
  'You author a Vitest unit-test file (node environment, no DOM). Write to ' + WEB + '/src/lib/shift/__tests__/new-badge.test.ts.',
  'First READ these files for exact APIs and the oracle:',
  '- ' + WEB + '/src/lib/shift/new-badge.ts (exports: normalizeTime, cardKey, detectNewKeys; and the ShiftCard type from ../api/shifts).',
  '- ' + MOBILE + '/lib/pages/my_shift_page.dart lines ~355-478 (the Flutter oracle: _normalizeTextForKey, _normalizeTimeForKey, _cardKeyFromShiftCardData, _isCardChanged, _detectNewOrUpdatedCardKeys).',
  '- ' + WEB + '/src/lib/api/shifts.ts (the ShiftCard shape; build minimal card objects in tests with taskName/startTime/endTime/place plus empty shiftMembers/beforeMembers/afterMembers as needed; use a small helper to build a ShiftCard).',
  '',
  'Import from "vitest" explicitly (describe, it, expect). Cover:',
  '1) normalizeTime: "8:0"->"08:00", "8:00"->"08:00", "08:00"->"08:00" (idempotent), "8:5"->"08:05", "23:45"->"23:45", non-match passthrough ("", "abc", "8:00:00"), clamp ("8:99"->"08:59", "120:0"->"99:00"), whitespace trim (" 8:0 "->"08:00").',
  '2) cardKey: exact format dayID + pipe + normalizedTaskName + pipe + normalizedStartTime + pipe + normalizedEndTime + pipe + normalizedPlace; taskName/place are trimmed; startTime/endTime normalized so "8:0" and "08:00" yield the same key; different dayID yields different key.',
  '3) detectNewKeys: baseline null => all current keys New; baseline equal to current keys => empty; one added key => just that key; one removed => absent; format-only time change ("8:00"->"8:0") => NOT new; empty-Set baseline (not null) with cards => all New.',
  '4) THE ORACLE-EQUIVALENCE META-TEST (most important): faithfully transcribe the Flutter _detectNewOrUpdatedCardKeys (the field-by-field version, using _isCardChanged) as a TS reference function operating on (dayID, oldCards|null, newCards). Then assert that for a comprehensive case grid (first load, no change, add, remove, change a field, format-only change) AND for several randomized card lists, the reference function output equals detectNewKeys(dayID, oldCards==null ? null : new Set(oldCards.map(c=>cardKey(dayID,c))), newCards). They must be equal because the card key already encodes the 4 fields. This converts the equivalence claim in new-badge.ts into a verified test.',
  '',
  'Make the tests pass against the CURRENT new-badge.ts (it is the SUT). If you find a genuine divergence from the Flutter oracle, still write the test to encode the Flutter behavior (it may fail — that is a real parity gap to report), but clearly comment it. Return the file path, the number of test cases, the oracle refs (file:line), and notes (esp. any divergence found).',
].join('\n')

const badgeStorePrompt = [
  'You author a Vitest unit-test file in JSDOM environment. Write to ' + WEB + '/src/lib/shift/__tests__/badge-store.test.ts. The VERY FIRST line of the file must be the comment: // @vitest-environment jsdom',
  'First READ ' + WEB + '/src/lib/shift/badge-store.ts (exports: subscribeBadges, getBadgeSnapshot, getBadgeServerSnapshot, reconcileBadges, markBadgeOpened) and ' + WEB + '/src/lib/shift/new-badge.ts (cardKey) and the oracle ' + MOBILE + '/lib/pages/my_shift_page.dart lines ~355-507 (opened/new keys, stale cleanup, onOpened).',
  '',
  'IMPORTANT test hygiene: badge-store.ts has module-level singletons (cache Map, listeners Set). To avoid cross-test leakage, use dynamic import with vi.resetModules() in beforeEach and clear localStorage. Pattern: in beforeEach do localStorage.clear(); vi.resetModules(); then within each test do const mod = await import("../badge-store"); and use mod.reconcileBadges etc. Import vi/describe/it/expect/beforeEach from "vitest". Build minimal ShiftCard objects (taskName/startTime/endTime/place + empty member fields).',
  '',
  'Cover these contracts (oracle = Flutter):',
  '1) First reconcileBadges (no baseline) => all cards visible as New via getBadgeSnapshot. Assert the localStorage keys written use Flutter Hive names: opened_keys_1, new_keys_1_2, shift_baseline_1_2 (for userID=1, dayID=2).',
  '2) reconcile twice with identical cards => second getBadgeSnapshot is empty (baseline now equals current).',
  '3) markBadgeOpened removes the key from new_keys storage AND adds to opened_keys storage AND getBadgeSnapshot no longer contains it.',
  '4) opened persists: open a card, reconcile again with same cards => card does NOT reappear as New.',
  '5) stale opened-key cleanup: open a card, then reconcile with that card removed => its key purged from opened_keys; an opened key for a DIFFERENT day survives.',
  '6) getBadgeSnapshot reference stability: two consecutive calls without mutation return the SAME Set reference (Object.is) — required by useSyncExternalStore.',
  '7) subscribeBadges listener fires once per reconcileBadges / markBadgeOpened.',
  '8) corrupt storage tolerance: put non-JSON in new_keys_1_2 => getBadgeSnapshot returns empty, no throw; non-array JSON in baseline => treated as first-load (all New).',
  '',
  'Tests target the CURRENT badge-store.ts (SUT). Encode Flutter behavior; if something genuinely diverges, write the encoding test and report it as a parity gap. Return file path, test count, oracle refs, notes.',
].join('\n')

const reviewedStorePrompt = [
  'You author a small Vitest unit-test file in JSDOM environment. Write to ' + WEB + '/src/lib/shift/__tests__/reviewed-store.test.ts. First line must be: // @vitest-environment jsdom',
  'READ ' + WEB + '/src/lib/shift/reviewed-store.ts (exports isReviewed, markReviewed) and the oracle ' + MOBILE + '/lib/widgets/review_bottom_sheet.dart (reviewedTaskNameBox.put(taskName, true) on success) and my_shift_page.dart _showReviewFormIfNeeded (a task already reviewed is skipped).',
  'Use beforeEach localStorage.clear() + vi.resetModules() + dynamic import. Cover: markReviewed makes isReviewed true; persists across vi.resetModules() re-import (simulated restart); unknown task is not reviewed; corrupt storage JSON => isReviewed false, no throw; multiple task names tracked independently. Import from "vitest". Return file path, test count, oracle refs, notes.',
].join('\n')

const schemasPrompt = [
  'You author a Vitest unit-test file (node environment) for the Zod schemas. Write to ' + WEB + '/src/lib/api/__tests__/schemas.test.ts.',
  'READ ' + WEB + '/src/lib/api/shifts.ts, rescues.ts, tasks.ts, client.ts. These export getShiftCards/getManuals/getMyRescueResponses etc. and internal Zod schemas. Some schemas are not exported — test through the exported helpers by mocking fetch, OR (preferred) re-implement small inline fixtures and assert the TRANSFORM behavior by calling the exported async functions with a mocked global fetch.',
  '',
  'Use vi.stubGlobal("fetch", ...) (import vi from "vitest") to return Response-like objects, then assert:',
  '1) shifts.ts getShiftCards: feed a snake_case shift-cards array (task_name/start_time/end_time/place/url/shift_members/before_members/after_members) with status 200; assert the returned objects are camelCase (taskName/startTime/endTime/place + shiftMembers/beforeMembers/afterMembers) and that null before_members/after_members/members fall back (Flutter used "データの取得に失敗しました" for null member name; sTime/eTime/members default to ""/[]).',
  '2) client.ts apiGetList null handling: a 200 response whose body is literally null must yield [] (not throw). Test via getMyRescueResponses (/rescues) and getRescueTasks (/tasks/users/:id) returning null => [].',
  '3) rescues.ts discriminated union: feed trouble/question/shorthanded variants (user_name/missing_number snake) and assert toCamel maps to userName/missingNumber and routes content per type; an unknown type discriminant must throw (boundary validation).',
  '4) tasks.ts getManuals: a rich object with extra fields {id, task, url, placeID,...} parses and keeps only {task, url} (Zod strips extras); empty task string is allowed.',
  '5) A malformed fixture missing a required field (e.g. shift-cards item without task_name) must make the parse THROW (loud failure, not silent coercion).',
  '',
  'Restore fetch after tests (vi.unstubAllGlobals in afterEach). Tests target the CURRENT schemas (SUT). Return file path, test count, oracle refs (api.dart / models), notes.',
].join('\n')

const verifyPrompt = [
  'You run the parity test suite and report results. Run this exact command and capture all output:',
  'cd ' + WEB + ' && npm run test 2>&1',
  '(npm run test maps to "vitest run"). Then run npx tsc --noEmit 2>&1 in the same dir to catch type errors in the new test files.',
  '',
  'Parse the vitest summary. Return: the command, passed/failed/total test counts, a list of failures (name + concise message), and parityGaps — failures that indicate the Next.js implementation genuinely diverges from the Flutter oracle (as opposed to a test bug or a type error). Distinguish: a failing oracle-equivalence meta-test or a failing localStorage-key-name assertion is a real parity gap; a TypeScript/import error is a test-authoring bug (report under failures, not parityGaps). Include the last ~40 lines of raw output in rawTail. Do NOT fix anything — only report.',
].join('\n')

// 再実行 fast-path（wf-improve 観測駆動の改善, issue #1）:
// テストが既に存在し全緑なら、冪等な Scaffold と再著作 Author を短絡して即 return する。
// 初回・環境リセット時（テスト未整備 or 赤）はフル実行にフォールバック。
const PRECHECK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    testsExist: { type: 'boolean' },
    passed: { type: 'number' },
    failed: { type: 'number' },
    detail: { type: 'string' },
  },
  required: ['testsExist', 'passed', 'failed', 'detail'],
}

const precheckPrompt = [
  '再実行 fast-path のための precheck。' + WEB + ' で既存テストの有無と合否のみを確認する。',
  '次を実行: cd ' + WEB + ' && npm run test 2>&1',
  '（npm run test は vitest run）。出力から判定する: testsExist（vitest がテストファイルを見つけたか。"No test files found" なら false）、passed（緑のテスト数）、failed（赤のテスト数）、detail（一行要約）。',
  '著作や修正は一切しない。実行して報告するだけ。',
].join('\n')

phase('Precheck')
log('既存テストの有無と合否を確認（再実行 fast-path 判定）')
const precheck = await agent(precheckPrompt, { label: 'precheck', schema: PRECHECK_SCHEMA })
if (precheck.testsExist && precheck.failed === 0 && precheck.passed > 0) {
  log('テスト既存＆全緑（' + precheck.passed + '件）→ 再実行 fast-path: scaffold/author をスキップ')
  return { fastPath: true, precheck }
}
log('テスト未整備 or 赤 → フル実行（scaffold→author→verify）')

phase('Scaffold')
log('Vitest 設定・shift シード投入・seeded /shifts 確認')
const scaffold = await agent(scaffoldPrompt, { label: 'scaffold', schema: SCAFFOLD_SCHEMA })

phase('Author')
log('4 モジュールのテストを並列著作（Flutter をオラクルに）')
const authored = (await parallel([
  () => agent(newBadgePrompt, { label: 'author:new-badge', phase: 'Author', schema: AUTHOR_SCHEMA }),
  () => agent(badgeStorePrompt, { label: 'author:badge-store', phase: 'Author', schema: AUTHOR_SCHEMA }),
  () => agent(reviewedStorePrompt, { label: 'author:reviewed-store', phase: 'Author', schema: AUTHOR_SCHEMA }),
  () => agent(schemasPrompt, { label: 'author:schemas', phase: 'Author', schema: AUTHOR_SCHEMA }),
])).filter(Boolean)

phase('Verify')
log('vitest run ＋ tsc で合否と parity gap を集計')
const verify = await agent(verifyPrompt, { label: 'verify', schema: VERIFY_SCHEMA })

return { fastPath: false, precheck, scaffold, authored, verify }
