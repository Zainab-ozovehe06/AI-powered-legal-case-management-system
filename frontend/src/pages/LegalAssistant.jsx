import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Database,
  FileText,
  Loader2,
  MessageSquare,
  Paperclip,
  Scale,
  Send,
  Trash2,
} from 'lucide-react';
import { api } from '../api/apiClient';

const MAX_FILES = 4;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

const supportedExtensions = new Set([
  '.pdf',
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

const suggestedPrompts = [
  'Summarize my active cases and urgent next steps.',
  'Which cases have uploaded documents I should review?',
  'Create a case note from the database and documents.',
];

const createMessageId = () =>
  window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;

const getExtension = (name = '') => {
  const dotIndex = name.lastIndexOf('.');
  return dotIndex >= 0 ? name.slice(dotIndex).toLowerCase() : '';
};

const isSupportedReference = (file) =>
  file.type === 'application/pdf' ||
  file.type.startsWith('text/') ||
  file.type === 'application/json' ||
  file.type === 'application/xml' ||
  file.type === 'application/rtf' ||
  supportedExtensions.has(getExtension(file.name));

const formatFileSize = (size) => {
  if (typeof size !== 'number') return 'Unknown size';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const normalizeList = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

const getDocumentConversationText = (document) => {
  if (!document) return '';

  const sectionText = normalizeList(document.sections)
    .map((section) => {
      const bullets = normalizeList(section.bullets).join('; ');
      return [section.heading, section.body, bullets].filter(Boolean).join(': ');
    })
    .join('\n');

  return [document.title, document.overview, sectionText].filter(Boolean).join('\n');
};

const getMessageForConversation = (message) => ({
  role: message.role,
  content: message.content || getDocumentConversationText(message.document),
});

const EmptyDocument = () => (
  <div className="ai-document-empty">
    <Scale size={22} />
    <div>
      <h3>Clinic Assistant</h3>
      <p>Ask a question about your accessible cases, records, and PDFs.</p>
    </div>
  </div>
);

const AssistantDocument = ({ document, references, model }) => {
  const sections = normalizeList(document?.sections);
  const keyPoints = normalizeList(document?.keyPoints);
  const nextSteps = normalizeList(document?.nextSteps);

  return (
    <article className="ai-document-card">
      <header className="ai-document-header">
        <div className="ai-document-mark">
          <FileText size={20} />
        </div>
        <div className="ai-document-title-block">
          <span className="ai-document-kicker">Assistant Answer</span>
          <h2>{document?.title || 'AI Assistant Response'}</h2>
          <p>{document?.subtitle || 'Generated from available clinic sources'}</p>
        </div>
      </header>

      <div className="ai-document-meta-row">
        <span>{new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date())}</span>
        {model ? <span>{model}</span> : null}
        {references?.length ? (
          <span>{references.length} source{references.length === 1 ? '' : 's'}</span>
        ) : null}
      </div>

      {document?.overview ? (
        <section className="ai-document-section ai-document-overview">
          <h3>Answer</h3>
          <p>{document.overview}</p>
        </section>
      ) : null}

      {keyPoints.length ? (
        <section className="ai-document-callout">
          <h3>Key Points</h3>
          <ul>
            {keyPoints.map((point) => (
              <li key={point}>
                <CheckCircle2 size={16} />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {sections.map((section, index) => {
        const bullets = normalizeList(section.bullets);

        return (
          <section key={`${section.heading || 'section'}-${index}`} className="ai-document-section">
            {section.heading ? <h3>{section.heading}</h3> : null}
            {section.body ? <p>{section.body}</p> : null}
            {bullets.length ? (
              <ul className="ai-document-bullets">
                {bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            ) : null}
          </section>
        );
      })}

      {nextSteps.length ? (
        <section className="ai-document-next">
          <h3>Next Steps</h3>
          <ol>
            {nextSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      ) : null}

      {document?.caveat ? (
        <footer className="ai-document-caveat">
          <AlertCircle size={16} />
          <span>{document.caveat}</span>
        </footer>
      ) : null}
    </article>
  );
};

export default function LegalAssistant() {
  const location = useLocation();
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState([]);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  const canSubmit = draft.trim().length > 0 && !isSubmitting;
  const totalFileSize = useMemo(
    () => files.reduce((total, file) => total + file.size, 0),
    [files]
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isSubmitting]);

  const handleFileChange = (event) => {
    const incomingFiles = Array.from(event.target.files || []);
    const nextFiles = [...files];
    let nextError = '';

    incomingFiles.forEach((file) => {
      if (nextFiles.length >= MAX_FILES) {
        nextError = `Attach up to ${MAX_FILES} reference files at once.`;
        return;
      }

      if (file.size > MAX_FILE_BYTES) {
        nextError = `${file.name} is larger than 8 MB.`;
        return;
      }

      if (!isSupportedReference(file)) {
        nextError = `${file.name} is not supported. Use PDF or text-like files.`;
        return;
      }

      nextFiles.push(file);
    });

    setFiles(nextFiles);
    setError(nextError);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveFile = (fileName) => {
    setFiles((currentFiles) => currentFiles.filter((file) => file.name !== fileName));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const prompt = draft.trim();

    if (!prompt) return;

    if (totalFileSize > 12 * 1024 * 1024) {
      setError('Keep reference uploads under 12 MB total.');
      return;
    }

    const attachedFiles = files;
    const userMessage = {
      id: createMessageId(),
      role: 'user',
      content: prompt,
      attachments: attachedFiles.map((file) => ({
        name: file.name,
        size: file.size,
      })),
    };

    setMessages((currentMessages) => [...currentMessages, userMessage]);
    setDraft('');
    setFiles([]);
    setError('');
    setIsSubmitting(true);

    try {
      const response = await api.sendAssistantMessage({
        prompt,
        files: attachedFiles,
        conversation: messages.map(getMessageForConversation),
        contextPath: location.pathname,
      });

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: createMessageId(),
          role: 'assistant',
          content: response.message || '',
          document: response.document,
          references: response.references || [],
          model: response.model,
        },
      ]);
    } catch (submissionError) {
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: createMessageId(),
          role: 'assistant',
          content: submissionError.message || 'The assistant could not respond.',
          isError: true,
        },
      ]);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="ai-assistant-page animate-fade-in">
      <div className="ai-assistant-page-hero">
        <div>
          <p className="ai-assistant-page-kicker">Clinic AI</p>
          <h1 className="ai-assistant-page-title">AI Assistant</h1>
        </div>
    
      </div>

      <section className="ai-assistant-widget ai-assistant-workspace" aria-label="AI assistant">
        <header className="ai-assistant-header">
          <div className="ai-assistant-heading">
            <div className="ai-assistant-icon">
              <Bot size={20} />
            </div>
            <div>
              <span>Law Clinic</span>
              <h2>Case Research Assistant</h2>
            </div>
          </div>
        </header>

        <div className="ai-assistant-suggestion-row">
          {suggestedPrompts.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => setDraft(suggestion)}
              disabled={isSubmitting}
            >
              {suggestion}
            </button>
          ))}
        </div>

        <div className="ai-assistant-thread">
          {messages.length === 0 ? <EmptyDocument /> : null}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`ai-message ai-message-${message.role}${message.isError ? ' ai-message-error' : ''}`}
            >
              {message.role === 'user' ? (
                <div className="ai-user-bubble">
                  <p>{message.content}</p>
                  {message.attachments?.length ? (
                    <div className="ai-attachment-strip">
                      {message.attachments.map((attachment) => (
                        <span key={attachment.name}>
                          <FileText size={14} />
                          {attachment.name}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : message.document && !message.isError ? (
                <AssistantDocument
                  document={message.document}
                  references={message.references}
                  model={message.model}
                />
              ) : (
                <div className="ai-assistant-note">
                  <AlertCircle size={17} />
                  <p>{message.content}</p>
                </div>
              )}
            </div>
          ))}

          {isSubmitting ? (
            <div className="ai-assistant-thinking">
              <Loader2 size={18} />
              <span>Checking sources...</span>
            </div>
          ) : null}

          <div ref={messagesEndRef} />
        </div>

        <form className="ai-assistant-composer" onSubmit={handleSubmit}>
          {files.length ? (
            <div className="ai-selected-files">
              {files.map((file) => (
                <div key={file.name} className="ai-selected-file">
                  <FileText size={15} />
                  <span>{file.name}</span>
                  <small>{formatFileSize(file.size)}</small>
                  <button
                    type="button"
                    onClick={() => handleRemoveFile(file.name)}
                    aria-label={`Remove ${file.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {error ? <div className="ai-composer-error">{error}</div> : null}

          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask about cases, deadlines, uploaded PDFs, summaries, or next steps..."
            rows={4}
            disabled={isSubmitting}
          />

          <div className="ai-composer-actions">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.md,.markdown,.csv,.json,.html,.htm,.xml,.rtf,text/*,application/pdf,application/json"
              multiple
              className="ai-hidden-input"
              onChange={handleFileChange}
            />
            <button
              type="button"
              className="ai-attach-button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isSubmitting || files.length >= MAX_FILES}
            >
              <Paperclip size={17} />
              Attach
            </button>
            <div className="ai-composer-spacer" />
            <button type="submit" className="ai-send-button" disabled={!canSubmit}>
              {isSubmitting ? <Loader2 size={17} className="ai-spinner" /> : <Send size={17} />}
              Send
            </button>
          </div>

          <div className="ai-composer-footnote">
            <MessageSquare size={14} />
            <span>Stored case records are included automatically.</span>
          </div>
        </form>
      </section>
    </div>
  );
}
