import { useState } from 'react'
import Icon from '../../components/Icon.jsx'
import { QuickChip } from '../../components/primitives.jsx'

export default function MobileSearchFilter({
  q = '',
  onSearchChange,
  placeholder = 'Search...',
  segs = [],
  activeSeg = 'all',
  onSegChange,
  sortOptions = [],
  activeSort = '',
  onSortChange,
  sortLabel = 'Sort'
}) {
  const [showSortMenu, setShowSortMenu] = useState(false)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '12px' }}>
      {/* Top Search & Sort Row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div className="m-msearch" style={{ flex: 1, height: '40px', background: 'var(--card)', borderRadius: '20px', border: '1px solid var(--line)', padding: '0 14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Icon name="search" size={16} style={{ color: 'var(--muted)', flexShrink: 0 }} />
          <input
            value={q}
            onChange={e => onSearchChange?.(e.target.value)}
            placeholder={placeholder}
            style={{ border: 'none', outline: 'none', background: 'transparent', flex: 1, fontFamily: 'var(--sans)', fontSize: '13.5px', color: 'var(--ink)' }}
          />
          {q && (
            <button
              onClick={() => onSearchChange?.('')}
              style={{ border: 'none', background: 'var(--line-2)', color: 'var(--muted)', width: '20px', height: '20px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}
            >
              <Icon name="x" size={12} />
            </button>
          )}
        </div>

        {/* Sort Button */}
        {sortOptions.length > 0 && (
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button
              className="m-sort-btn"
              onClick={() => setShowSortMenu(!showSortMenu)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                height: '38px',
                padding: '0 10px',
                borderRadius: '8px',
                border: '1px solid var(--line)',
                background: '#fff',
                color: 'var(--ink)',
                fontSize: '12.5px',
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'var(--sans)',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
              }}
            >
              <span style={{ color: 'var(--muted)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>Sort</span>
              <span style={{ fontWeight: 600 }}>{sortLabel}</span>
              <Icon name="chevDown" size={13} style={{ color: 'var(--faint)' }} />
            </button>

            {/* Sort Menu Dropdown */}
            {showSortMenu && (
              <>
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 60 }}
                  onClick={() => setShowSortMenu(false)}
                />
                <div
                  style={{
                    position: 'absolute',
                    top: '46px',
                    right: 0,
                    width: '180px',
                    background: 'var(--card)',
                    border: '1px solid var(--line)',
                    borderRadius: '16px',
                    boxShadow: 'var(--shadow-pop)',
                    padding: '6px',
                    zIndex: 61,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                    animation: 'riseIn .15s ease both'
                  }}
                >
                  <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)', padding: '6px 10px 4px' }}>
                    Sort by
                  </div>
                  {sortOptions.map(opt => {
                    const isSelected = activeSort === opt.key
                    return (
                      <button
                        key={opt.key}
                        onClick={() => {
                          onSortChange?.(opt.key)
                          setShowSortMenu(false)
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 10px',
                          border: 'none',
                          background: isSelected ? 'var(--accent-wash)' : 'transparent',
                          color: isSelected ? 'var(--accent-ink)' : 'var(--ink)',
                          borderRadius: '10px',
                          fontSize: '13px',
                          fontWeight: isSelected ? 600 : 500,
                          cursor: 'pointer',
                          textAlign: 'left',
                          fontFamily: 'var(--sans)'
                        }}
                      >
                        <span>{opt.label}</span>
                        {isSelected && <Icon name="check" size={14} />}
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Horizontal Filter Pills (Strict No-Wrap) */}
      {segs.length > 0 && (
        <div className="m-seg-scroll" style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px', margin: '0 -14px', paddingLeft: '14px', paddingRight: '14px' }}>
          {segs.map(s => (
            <QuickChip
              key={s.key}
              on={activeSeg === s.key}
              onClick={() => onSegChange?.(s.key)}
            >
              {s.label}{s.n !== undefined && s.n !== null ? ` (${s.n})` : ''}
            </QuickChip>
          ))}
        </div>
      )}
    </div>
  )
}
