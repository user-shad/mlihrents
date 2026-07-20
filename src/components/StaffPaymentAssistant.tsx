import { useData } from '../context/DataContext'
import { useLang } from '../context/LangContext'

export function StaffPaymentAssistant() {
  const { tr } = useLang()
  const {
    staffMessages,
    staffChatInput,
    setStaffChatInput,
    staffChatEndRef,
    sendStaffChat,
    pendingPayments,
    staffAnalyzing,
  } = useData()

  return (
    <section className="panel staff-assistant-panel" style={{ marginBottom: '1rem' }}>
      <div className="file-head">
        <div>
          <h2 style={{ marginBottom: '0.25rem' }}>{tr('staffPaymentAssistant')}</h2>
          <p className="meta" style={{ margin: 0 }}>
            {tr('staffPaymentAssistantLead')}
          </p>
        </div>
        {pendingPayments.length > 0 && (
          <span className="badge badge-due">
            {pendingPayments.length} {tr('pendingReview')}
          </span>
        )}
      </div>

      <div className="chat-layout staff-chat-layout">
        <div className="chat-banner">
          <div>
            <strong>{tr('staffPaymentAssistant')}</strong>
            <span>{tr('staffPaymentAssistantMeta')}</span>
          </div>
        </div>
        <div className="chat-stream">
          {staffMessages.map((m) => (
            <div key={m.id} className={`bubble ${m.role === 'user' ? 'user' : m.role}`}>
              {m.text.split('\n').map((line, i) => (
                <span key={i}>
                  {i > 0 && <br />}
                  {line}
                </span>
              ))}
              <span className="time">{m.time}</span>
            </div>
          ))}
          <div ref={staffChatEndRef} />
        </div>
        <div className="quick-prompts">
          {[tr('staffPromptPending'), tr('staffPromptRef'), tr('staffPromptScan'), tr('staffPromptHelp')].map(
            (q) => (
            <button
              key={q}
              className="chip"
              type="button"
              disabled={staffAnalyzing}
              onClick={() => sendStaffChat(q)}
            >
              {q}
            </button>
          ),
          )}
        </div>
        <form
          className="chat-compose"
          onSubmit={(e) => {
            e.preventDefault()
            sendStaffChat(staffChatInput)
          }}
        >
          <input
            value={staffChatInput}
            onChange={(e) => setStaffChatInput(e.target.value)}
            placeholder={tr('staffAskPayment')}
            disabled={staffAnalyzing}
          />
          <button className="btn btn-primary" type="submit" disabled={staffAnalyzing}>
            {staffAnalyzing ? tr('processing') : tr('send')}
          </button>
        </form>
      </div>
    </section>
  )
}
