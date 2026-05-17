import express from 'express';
import fs from 'fs/promises';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../config/firebase.js';
import { requireAuth } from '../middleware/authenticate.js';
import {
  getActorId,
  getGroupIdsForUser,
  getVisibleCaseIdsForStudent,
  isCaseAssignedToGroup,
  isCaseDeleted,
  normalizeText,
} from '../utils/groupCollaboration.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsRoot = path.resolve(__dirname, '..', 'uploads');

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const MAX_UPLOAD_FILE_BYTES = 8 * 1024 * 1024;
const MAX_STORED_DOCUMENT_BYTES = 14 * 1024 * 1024;
const MAX_TOTAL_INLINE_BYTES = 20 * 1024 * 1024;
const MAX_UPLOAD_FILES = 4;
const MAX_STORED_DOCUMENTS = 5;
const MAX_DETAILED_CASES = 8;
const MAX_CASE_SUMMARIES = 40;

const textLikeExtensions = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.csv',
  '.json',
  '.html',
  '.htm',
  '.xml',
  '.rtf',
]);

const stopWords = new Set([
  'about',
  'after',
  'again',
  'against',
  'also',
  'and',
  'answer',
  'are',
  'case',
  'cases',
  'court',
  'database',
  'document',
  'documents',
  'for',
  'from',
  'has',
  'have',
  'how',
  'into',
  'law',
  'legal',
  'matter',
  'pdf',
  'pdfs',
  'please',
  'show',
  'that',
  'the',
  'this',
  'with',
  'what',
  'when',
  'where',
  'which',
  'who',
  'why',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_FILE_BYTES,
    files: MAX_UPLOAD_FILES,
  },
});

const getGeminiModel = () => process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const getGeminiApiUrl = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

const getGenerationConfig = (model) => ({
  maxOutputTokens: 4096,
  responseMimeType: 'application/json',
  ...(model.startsWith('gemini-3') ? {} : { temperature: 0.2 }),
});

const getExtension = (fileName = '') => {
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : '';
};

const getReferenceMimeType = ({ mimetype, originalname, document_type, name } = {}) => {
  const mimeType = (mimetype || document_type || '').toLowerCase();
  const extension = getExtension(originalname || name);

  if (mimeType === 'application/pdf' || extension === '.pdf') {
    return 'application/pdf';
  }

  if (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    mimeType === 'application/xml' ||
    mimeType === 'application/rtf' ||
    textLikeExtensions.has(extension)
  ) {
    return 'text/plain';
  }

  return null;
};

const resolveUploadPath = (relativePath) => {
  const absolutePath = path.resolve(uploadsRoot, path.normalize(relativePath || ''));
  const relativeToRoot = path.relative(uploadsRoot, absolutePath);

  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    throw new Error('Invalid document path');
  }

  return absolutePath;
};

const toTimestampMillis = (value) => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value < 10000000000 ? value * 1000 : value;
  if (typeof value === 'string') {
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value._seconds === 'number') {
    return value._seconds * 1000 + Math.floor((value._nanoseconds || 0) / 1000000);
  }
  if (typeof value.seconds === 'number') {
    return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1000000);
  }

  return 0;
};

const formatDateTime = (value) => {
  const millis = toTimestampMillis(value);

  if (!millis) return 'not recorded';

  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(millis));
};

const normalizeTokens = (text = '') =>
  [
    ...new Set(
      text
        .toString()
        .toLowerCase()
        .match(/[a-z0-9]+/g)
        ?.filter((token) => token.length > 2 && !stopWords.has(token)) || []
    ),
  ];

const scoreText = (text = '', tokens = []) => {
  if (!tokens.length) return 0;

  const haystack = text.toString().toLowerCase();

  return tokens.reduce((score, token) => {
    if (!haystack.includes(token)) return score;
    return score + (token.length > 4 ? 3 : 1);
  }, 0);
};

const safeText = (value, fallback = 'not recorded') => {
  const text = normalizeText(value);
  return text || fallback;
};

const getCaseTitle = (caseItem) => {
  const clientName = normalizeText(caseItem?.client_name);
  const offence = normalizeText(caseItem?.offence);

  if (clientName && offence) return `${clientName} - ${offence}`;
  if (clientName) return clientName;
  if (offence) return offence;
  return caseItem?.id || 'Untitled case';
};

const getCaseOrderTime = (caseItem) =>
  toTimestampMillis(caseItem?.date_opened) ||
  toTimestampMillis(caseItem?.created_at) ||
  toTimestampMillis(caseItem?.createdAt);

const withCaseDisplayIds = (cases = []) => {
  const displayIds = new Map(
    [...cases]
      .sort((a, b) => {
        const timeA = getCaseOrderTime(a);
        const timeB = getCaseOrderTime(b);

        if (timeA && timeB && timeA !== timeB) return timeA - timeB;
        if (timeA && !timeB) return -1;
        if (!timeA && timeB) return 1;
        return (a.id || '').localeCompare(b.id || '');
      })
      .map((caseItem, index) => [
        caseItem.id,
        String(index + 1).padStart(3, '0'),
      ])
  );

  return cases.map((caseItem) => ({
    ...caseItem,
    caseDisplayId: displayIds.get(caseItem.id) || '---',
  }));
};

const serializeDoc = (doc) => ({
  id: doc.id,
  ...doc.data(),
});

const getVisibleCases = async (currentUser) => {
  const actorId = currentUser?.uid || currentUser?.user_id;

  if (!actorId) {
    const error = new Error('Authenticated user ID missing');
    error.statusCode = 401;
    throw error;
  }

  if (currentUser.role === 'admin') {
    const snapshot = await db.collection('cases').get();

    return withCaseDisplayIds(
      snapshot.docs.map(serializeDoc).filter((caseItem) => !isCaseDeleted(caseItem))
    );
  }

  if (currentUser.role === 'law_student') {
    const caseIds = await getVisibleCaseIdsForStudent(actorId);

    if (!caseIds.length) return [];

    const caseDocs = await Promise.all(
      caseIds.map((caseId) => db.collection('cases').doc(caseId).get())
    );

    return withCaseDisplayIds(
      caseDocs
        .filter((doc) => doc.exists && !isCaseDeleted(doc.data()))
        .map(serializeDoc)
    );
  }

  return [];
};

const sortByRecent = (items, timestampFields) =>
  [...items].sort((a, b) => {
    const timeA = timestampFields.reduce(
      (best, field) => best || toTimestampMillis(a[field]),
      0
    );
    const timeB = timestampFields.reduce(
      (best, field) => best || toTimestampMillis(b[field]),
      0
    );

    return timeB - timeA;
  });

const getAuthorizedReflectionGroupIds = async (caseId, currentUser) => {
  if (currentUser.role === 'admin') return null;
  if (currentUser.role !== 'law_student') return [];

  const actorId = currentUser?.uid || currentUser?.user_id;
  const userGroupIds = await getGroupIdsForUser(actorId);
  const assignmentChecks = await Promise.all(
    userGroupIds.map(async (groupId) => ({
      groupId,
      assigned: await isCaseAssignedToGroup(caseId, groupId),
    }))
  );

  return assignmentChecks
    .filter((item) => item.assigned)
    .map((item) => item.groupId);
};

const getRelatedRecordsByCase = async (cases, currentUser) => {
  const entries = await Promise.all(
    cases.map(async (caseItem) => {
      const caseId = caseItem.id;
      const [
        activitiesSnap,
        documentsSnap,
        eventsSnap,
        reflectionsSnap,
        authorizedReflectionGroupIds,
      ] = await Promise.all([
        db.collection('activities').where('case_id', '==', caseId).get(),
        db.collection('documents').where('case_id', '==', caseId).get(),
        db.collection('events').where('case_id', '==', caseId).get(),
        db.collection('group_reflections').where('case_id', '==', caseId).get(),
        getAuthorizedReflectionGroupIds(caseId, currentUser),
      ]);

      const reflections = reflectionsSnap.docs
        .map(serializeDoc)
        .filter(
          (reflection) =>
            !authorizedReflectionGroupIds ||
            authorizedReflectionGroupIds.includes(reflection.group_id)
        );

      return [
        caseId,
        {
          activities: sortByRecent(activitiesSnap.docs.map(serializeDoc), [
            'logged_at',
            'created_at',
            'date',
          ]),
          documents: sortByRecent(documentsSnap.docs.map(serializeDoc), [
            'upload_date',
            'created_at',
          ]),
          events: sortByRecent(eventsSnap.docs.map(serializeDoc), [
            'date',
            'created_at',
          ]),
          reflections: sortByRecent(reflections, ['submitted_at', 'created_at']),
        },
      ];
    })
  );

  return new Map(entries);
};

const getCaseSearchText = (caseItem, related) => {
  const relatedRecords = related.get(caseItem.id) || {};

  return [
    caseItem.id,
    caseItem.caseDisplayId,
    caseItem.client_name,
    caseItem.case_type,
    caseItem.offence,
    caseItem.description,
    caseItem.status,
    ...(relatedRecords.activities || []).map((activity) => activity.description),
    ...(relatedRecords.documents || []).map((document) => document.name),
    ...(relatedRecords.events || []).map((event) =>
      [event.title, event.event_type, event.description, event.location].join(' ')
    ),
    ...(relatedRecords.reflections || []).map((reflection) =>
      [reflection.title, reflection.content].join(' ')
    ),
  ]
    .filter(Boolean)
    .join(' ');
};

const selectRelevantCases = (prompt, cases, related) => {
  const tokens = normalizeTokens(prompt);

  return [...cases]
    .map((caseItem) => ({
      caseItem,
      score:
        scoreText(getCaseSearchText(caseItem, related), tokens) +
        (prompt.includes(caseItem.id) ? 10 : 0) +
        (caseItem.caseDisplayId && prompt.includes(caseItem.caseDisplayId) ? 10 : 0),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return getCaseOrderTime(b.caseItem) - getCaseOrderTime(a.caseItem);
    })
    .slice(0, MAX_DETAILED_CASES)
    .map((item) => item.caseItem);
};

const getStatusCounts = (cases) =>
  cases.reduce((counts, caseItem) => {
    const status = safeText(caseItem.status, 'unknown').toLowerCase();
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});

const formatStatusCounts = (counts) =>
  Object.entries(counts)
    .map(([status, count]) => `${status}: ${count}`)
    .join(', ') || 'none';

const formatCaseSummary = (caseItem) =>
  [
    `Case ${caseItem.caseDisplayId} (${caseItem.id})`,
    `client: ${safeText(caseItem.client_name)}`,
    `type: ${safeText(caseItem.case_type)}`,
    `matter/offence: ${safeText(caseItem.offence)}`,
    `status: ${safeText(caseItem.status)}`,
    `opened: ${formatDateTime(caseItem.date_opened || caseItem.created_at)}`,
  ].join(' | ');

const formatRecordLines = (items, formatter, emptyText, limit = 8) => {
  if (!items?.length) return emptyText;

  return items
    .slice(0, limit)
    .map((item, index) => `${index + 1}. ${formatter(item)}`)
    .join('\n');
};

const buildDatabaseContext = ({ cases, selectedCases, related }) => {
  const statusCounts = getStatusCounts(cases);
  const caseSummaries = cases.slice(0, MAX_CASE_SUMMARIES).map(formatCaseSummary);
  const hiddenCaseCount = Math.max(0, cases.length - caseSummaries.length);

  const detailedSections = selectedCases.map((caseItem) => {
    const records = related.get(caseItem.id) || {};

    return `
CASE DETAIL: ${getCaseTitle(caseItem)}
- Display ID: ${caseItem.caseDisplayId}
- Database ID: ${caseItem.id}
- Client: ${safeText(caseItem.client_name)}
- Type: ${safeText(caseItem.case_type)}
- Matter/offence: ${safeText(caseItem.offence)}
- Status: ${safeText(caseItem.status)}
- Opened: ${formatDateTime(caseItem.date_opened || caseItem.created_at)}
- Description: ${safeText(caseItem.description, 'No description recorded')}

Activities:
${formatRecordLines(
  records.activities,
  (activity) =>
    `${formatDateTime(activity.logged_at || activity.date)} - ${safeText(activity.description)}${
      activity.court_name ? ` (${activity.court_name})` : ''
    }`,
  'No activities recorded.'
)}

Events:
${formatRecordLines(
  records.events,
  (event) =>
    `${safeText(event.date)} ${safeText(event.start_time, '')}-${safeText(
      event.end_time,
      ''
    )}: ${safeText(event.title)} [${safeText(event.event_type)} / ${safeText(
      event.status
    )}]${event.description ? ` - ${event.description}` : ''}`,
  'No events recorded.'
)}

Stored Documents:
${formatRecordLines(
  records.documents,
  (document) =>
    `${safeText(document.name)} (${safeText(document.document_type, 'unknown type')}, ${
      document.size || 'unknown'
    } bytes, uploaded ${formatDateTime(document.upload_date)})`,
  'No stored documents recorded.'
)}

Group Reflections:
${formatRecordLines(
  records.reflections,
  (reflection) =>
    `${safeText(reflection.title)} submitted ${formatDateTime(
      reflection.submitted_at
    )}: ${safeText(reflection.content)}`,
  'No group reflections available to this user.',
  5
)}
`.trim();
  });

  return `
DATABASE RETRIEVAL CONTEXT
Visible case count for this signed-in user: ${cases.length}
Case status counts: ${formatStatusCounts(statusCounts)}

Visible case summaries${hiddenCaseCount ? ` (first ${MAX_CASE_SUMMARIES}; ${hiddenCaseCount} more omitted)` : ''}:
${caseSummaries.length ? caseSummaries.join('\n') : 'No cases are visible to this user.'}

Most relevant detailed case records:
${detailedSections.length ? detailedSections.join('\n\n---\n\n') : 'No detailed case records available.'}
`.trim();
};

const getConversationSummary = (value) => {
  if (!value) return '';

  try {
    const conversation = JSON.parse(value);

    if (!Array.isArray(conversation)) return '';

    return conversation
      .slice(-8)
      .map((message) => {
        const role = message.role === 'assistant' ? 'Assistant' : 'User';
        const content = (message.content || message.document?.overview || '')
          .toString()
          .slice(0, 1400);

        return content ? `${role}: ${content}` : '';
      })
      .filter(Boolean)
      .join('\n');
  } catch {
    return '';
  }
};

const getGeminiText = (data) =>
  data?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('\n')
    .trim() || '';

const stripJsonFence = (text) => {
  const trimmed = text.trim();

  if (!trimmed.startsWith('```')) return trimmed;

  return trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();
};

const parseAssistantDocument = (text) => {
  const fallback = {
    title: 'AI Assistant Response',
    subtitle: 'Generated from available case sources',
    overview: text || '',
    sections: [],
    keyPoints: [],
    nextSteps: [],
    caveat:
      'This response is generated support for clinic work and is not final legal advice.',
  };

  if (!text) return fallback;

  try {
    const parsed = JSON.parse(stripJsonFence(text));

    return {
      title: parsed.title || fallback.title,
      subtitle: parsed.subtitle || fallback.subtitle,
      overview: parsed.overview || parsed.summary || '',
      sections: Array.isArray(parsed.sections) ? parsed.sections : [],
      keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
      nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps : [],
      caveat: parsed.caveat || parsed.disclaimer || fallback.caveat,
    };
  } catch {
    return fallback;
  }
};

const buildPrompt = ({
  prompt,
  conversationSummary,
  contextPath,
  user,
  databaseContext,
}) => `
You are Nile Law Clinic's AI assistant. Answer questions for authenticated clinic users using the provided database context, stored case documents, and user-attached reference files.

Accuracy rules:
- Treat the provided database context and PDFs/files as the only source of case facts.
- Do not invent clients, dates, case statuses, events, document contents, statutes, authorities, or procedural facts.
- If the available sources do not answer something, say that the available database/documents do not show it.
- Prefer direct answers for direct questions. Only draft memos, reports, notes, or letters when the user asks for that.
- When you use a source, mention the case display ID, case name, stored document name, or uploaded file name in the answer.
- Respect access control: answer only from the context supplied in this request.
- This is legal research and drafting support, not final legal advice.

Return only valid JSON in this shape:
{
  "title": "short answer title",
  "subtitle": "short source-aware subtitle",
  "overview": "direct answer in one or two concise paragraphs",
  "sections": [
    { "heading": "section heading", "body": "paragraph text", "bullets": ["optional bullet"] }
  ],
  "keyPoints": ["important source-grounded point"],
  "nextSteps": ["specific next step if useful"],
  "caveat": "short caution or limitation"
}

Signed-in user:
- Email/name: ${user?.email || user?.name || 'Authenticated user'}
- Role: ${user?.role || 'unknown'}
- Current app location: ${contextPath || 'Not provided'}

Recent conversation:
${conversationSummary || 'No prior assistant context.'}

${databaseContext}

User question:
${prompt}
`;

const buildUploadedReferenceParts = (files) =>
  files.flatMap((file) => {
    const mimeType = getReferenceMimeType(file);

    return [
      {
        text: `Uploaded reference file: ${file.originalname} (${mimeType}, ${file.size} bytes)`,
      },
      {
        inline_data: {
          mime_type: mimeType,
          data: file.buffer.toString('base64'),
        },
      },
    ];
  });

const selectStoredDocumentCandidates = ({ prompt, selectedCases, related }) => {
  const tokens = normalizeTokens(prompt);
  const promptMentionsDocuments = /\b(pdf|pdfs|document|documents|file|files|evidence|attachment)\b/i.test(
    prompt
  );

  return selectedCases
    .flatMap((caseItem) => {
      const records = related.get(caseItem.id) || {};

      return (records.documents || []).map((document) => ({
        caseItem,
        document,
        score:
          scoreText(
            [
              document.name,
              document.document_type,
              caseItem.client_name,
              caseItem.offence,
              caseItem.description,
              caseItem.caseDisplayId,
            ].join(' '),
            tokens
          ) + (promptMentionsDocuments ? 2 : 0),
      }));
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return toTimestampMillis(b.document.upload_date) - toTimestampMillis(a.document.upload_date);
    });
};

const buildStoredDocumentReferenceParts = async ({
  prompt,
  selectedCases,
  related,
  existingInlineBytes,
}) => {
  const parts = [];
  const references = [];
  let storedBytes = 0;

  const candidates = selectStoredDocumentCandidates({
    prompt,
    selectedCases,
    related,
  });

  for (const candidate of candidates) {
    if (references.length >= MAX_STORED_DOCUMENTS) break;

    const { caseItem, document } = candidate;
    const mimeType = getReferenceMimeType(document);

    if (!mimeType || !document.server_file_path) continue;

    try {
      const absolutePath = resolveUploadPath(document.server_file_path);
      const fileStats = await fs.stat(absolutePath);

      if (
        storedBytes + fileStats.size > MAX_STORED_DOCUMENT_BYTES ||
        existingInlineBytes + storedBytes + fileStats.size > MAX_TOTAL_INLINE_BYTES
      ) {
        continue;
      }

      const buffer = await fs.readFile(absolutePath);
      storedBytes += buffer.length;

      parts.push({
        text: `Stored case document: ${document.name} for Case ${caseItem.caseDisplayId} (${getCaseTitle(
          caseItem
        )}) (${mimeType}, ${buffer.length} bytes)`,
      });
      parts.push({
        inline_data: {
          mime_type: mimeType,
          data: buffer.toString('base64'),
        },
      });
      references.push({
        name: document.name || 'Stored document',
        type: 'stored_document',
        caseId: caseItem.id,
        caseDisplayId: caseItem.caseDisplayId,
        mimeType,
        size: buffer.length,
      });
    } catch (error) {
      console.warn(
        `Skipping stored AI reference document ${document.id || document.name}:`,
        error.message
      );
    }
  }

  return { parts, references };
};

router.post('/assistant', requireAuth, upload.array('references', MAX_UPLOAD_FILES), async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: 'Gemini API key is not configured. Add GEMINI_API_KEY to server/.env.',
      });
    }

    const prompt = req.body?.prompt?.toString().trim();

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required.' });
    }

    const files = req.files || [];
    const uploadBytes = files.reduce((sum, file) => sum + file.size, 0);

    if (uploadBytes > MAX_UPLOAD_BYTES) {
      return res.status(413).json({
        error: 'Reference files are too large. Keep uploads under 12 MB total.',
      });
    }

    const unsupportedFile = files.find((file) => !getReferenceMimeType(file));

    if (unsupportedFile) {
      return res.status(400).json({
        error: `Unsupported reference file: ${unsupportedFile.originalname}. Upload PDF or text-like files.`,
      });
    }

    const visibleCases = await getVisibleCases(req.currentUser);
    const related = await getRelatedRecordsByCase(visibleCases, req.currentUser);
    const selectedCases = selectRelevantCases(prompt, visibleCases, related);
    const databaseContext = buildDatabaseContext({
      cases: visibleCases,
      selectedCases,
      related,
    });
    const storedReferences = await buildStoredDocumentReferenceParts({
      prompt,
      selectedCases,
      related,
      existingInlineBytes: uploadBytes,
    });
    const conversationSummary = getConversationSummary(req.body?.conversation);
    const promptText = buildPrompt({
      prompt,
      conversationSummary,
      contextPath: req.body?.contextPath?.toString() || '',
      user: req.currentUser,
      databaseContext,
    });
    const uploadedReferenceParts = buildUploadedReferenceParts(files);
    const model = getGeminiModel();

    const geminiResponse = await fetch(getGeminiApiUrl(model), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: 'Use these source materials before answering.' },
              { text: databaseContext },
              ...storedReferences.parts,
              ...uploadedReferenceParts,
              { text: promptText },
            ],
          },
        ],
        generationConfig: getGenerationConfig(model),
      }),
    });

    const responseText = await geminiResponse.text();
    let responseData = null;

    try {
      responseData = responseText ? JSON.parse(responseText) : null;
    } catch {
      responseData = null;
    }

    if (!geminiResponse.ok) {
      const geminiError =
        responseData?.error?.message || responseText || 'Gemini request failed.';

      return res.status(geminiResponse.status).json({ error: geminiError });
    }

    const assistantText = getGeminiText(responseData);
    const document = parseAssistantDocument(assistantText);

    return res.status(200).json({
      message: assistantText,
      document,
      model,
      references: [
        {
          name: 'Accessible Firestore case database',
          type: 'database',
          count: visibleCases.length,
        },
        ...selectedCases.map((caseItem) => ({
          name: `Case ${caseItem.caseDisplayId}: ${getCaseTitle(caseItem)}`,
          type: 'case_record',
          caseId: caseItem.id,
          caseDisplayId: caseItem.caseDisplayId,
        })),
        ...storedReferences.references,
        ...files.map((file) => ({
          name: file.originalname,
          type: 'uploaded_reference',
          size: file.size,
          mimeType: getReferenceMimeType(file),
        })),
      ],
      retrieval: {
        visibleCaseCount: visibleCases.length,
        detailedCaseCount: selectedCases.length,
        storedDocumentCount: storedReferences.references.length,
        uploadedReferenceCount: files.length,
      },
      usage: responseData?.usageMetadata || null,
    });
  } catch (error) {
    console.error('AI assistant error:', error);
    return res.status(error.statusCode || 500).json({
      error: error.message || 'Failed to generate assistant response.',
    });
  }
});

export default router;
