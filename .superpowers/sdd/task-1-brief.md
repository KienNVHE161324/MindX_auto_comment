### Task 1: Data model — types & IPC

**Files:**
- Modify: `src/shared/types.ts`
- Test: `src/shared/types.test.ts`

**Interfaces:**
- Produces: `SessionContent.absentStudentIds?: string[]`; `LmsContentTarget { classCode, sessionId, sessionDate }`; `LmsContentResult { classCode, sessionDate, lessonContent, homework, students: {name, attended, comment}[] }`; `LmsSyncAllResult { newClasses: LmsScrapedClass[], contentResults: LmsContentResult[], skippedClasses: string[] }`; `IPC.lmsSyncAll = 'lms:syncAll'`; `AppApi.lmsSyncAll(params: { existingCodes: string[]; contentTargets: LmsContentTarget[] }): Promise<LmsSyncAllResult>`.

- [ ] **Step 1: Write the failing test**

Thêm vào cuối `src/shared/types.test.ts`:

```ts
import { IPC } from './types'

describe('IPC lms sync', () => {
  it('dùng key lms:syncAll (thay cho lms:syncClasses cũ)', () => {
    expect(IPC.lmsSyncAll).toBe('lms:syncAll')
  })
})
```

(Giữ nguyên import `DEFAULT_CONFIG, DEFAULT_ZALO_TEMPLATE` đã có ở đầu file, chỉ thêm `IPC` vào cùng dòng import.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/shared/types.test.ts`
Expected: FAIL — `IPC.lmsSyncAll` is `undefined`.

- [ ] **Step 3: Implement**

Trong `src/shared/types.ts`, sửa `SessionContent`:

```ts
export interface SessionContent {
  id: string
  classId: string
  sessionId: string
  lessonContent: string
  homework: string
  comments: StudentComment[]
  absentStudentIds?: string[]
}
```

Thêm sau `LmsSyncResult`:

```ts
export interface LmsContentTarget {
  classCode: string
  sessionId: string
  sessionDate: string  // 'YYYY-MM-DD'
}

export interface LmsContentResult {
  classCode: string
  sessionDate: string  // 'YYYY-MM-DD'
  lessonContent: string
  homework: string
  students: { name: string; attended: boolean; comment: string }[]
}

export interface LmsSyncAllResult {
  newClasses: LmsScrapedClass[]
  contentResults: LmsContentResult[]
  skippedClasses: string[]
}
```

Trong khối `IPC`, đổi:

```ts
  lmsSyncClasses: 'lms:syncClasses',
```
thành
```ts
  lmsSyncAll: 'lms:syncAll',
```

Trong `AppApi`, đổi:

```ts
  lmsSyncClasses(): Promise<LmsSyncResult>
```
thành
```ts
  lmsSyncAll(params: { existingCodes: string[]; contentTargets: LmsContentTarget[] }): Promise<LmsSyncAllResult>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/shared/types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/shared/types.test.ts
git commit -m "feat(types): thêm absentStudentIds, LmsSyncAll types, đổi IPC lmsSyncClasses -> lmsSyncAll"
```

---

