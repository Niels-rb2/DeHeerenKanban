export default function SettingsPage() {
  return (
    <div className="max-w-2xl">
      <div className="mb-6 mt-4">
        <p className="text-xs uppercase tracking-widest font-medium mb-1" style={{ color: 'var(--clr-text-muted)' }}>
          Configuratie
        </p>
        <h1
          className="text-2xl md:text-[2.5rem] font-medium leading-none"
          style={{ color: 'var(--clr-text)' }}
        >
          Instellingen
        </h1>
      </div>

      <div className="space-y-4">
        <div className="bento-card rounded-2xl">
          <h2 className="font-semibold mb-4" style={{ color: 'var(--clr-text)' }}>
            Gmail configuratie
          </h2>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1 block" style={{ color: 'var(--clr-text-dim)' }}>
                Gmail label
              </label>
              <input
                type="text"
                defaultValue="Besloten feestje"
                className="input-dark text-sm"
                disabled
              />
              <p className="text-xs mt-1" style={{ color: 'var(--clr-text-subtle)' }}>
                Stel in via .env: GMAIL_LABEL
              </p>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block" style={{ color: 'var(--clr-text-dim)' }}>
                Café e-mailadres
              </label>
              <input
                type="text"
                defaultValue="info@cafedeheeren.nl"
                className="input-dark text-sm"
                disabled
              />
              <p className="text-xs mt-1" style={{ color: 'var(--clr-text-subtle)' }}>
                Stel in via .env: CAFE_EMAIL
              </p>
            </div>
          </div>
        </div>

        <div className="bento-card rounded-2xl">
          <h2 className="font-semibold mb-4" style={{ color: 'var(--clr-text)' }}>
            AI instellingen
          </h2>
          <div>
            <label className="text-sm font-medium mb-1 block" style={{ color: 'var(--clr-text-dim)' }}>
              OpenAI model
            </label>
            <input
              type="text"
              defaultValue="gpt-4o-mini"
              className="input-dark text-sm"
              disabled
            />
          </div>
        </div>

        <div className="bento-card rounded-2xl">
          <h2 className="font-semibold mb-2" style={{ color: 'var(--clr-text)' }}>
            Demo modus
          </h2>
          <p className="text-sm" style={{ color: 'var(--clr-text-dim)' }}>
            Demo modus is momenteel{' '}
            <strong>
              {process.env.NEXT_PUBLIC_DEMO_MODE === 'true' ? 'ingeschakeld' : 'uitgeschakeld'}
            </strong>
            . Stel in via .env: <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">NEXT_PUBLIC_DEMO_MODE=true</code>
          </p>
        </div>
      </div>
    </div>
  );
}
