import { describe, expect, it } from 'vitest'
import { mergeProofStores } from '../../lib/syncProofStore'

describe('mergeProofStores', () => {
  it('keeps existing screenshots when a sync omits proof data', () => {
    const existing = {
      'PAY-123': { name: 'proof.jpg', dataUrl: 'data:image/jpeg;base64,abc' },
    }
    const incoming = {}
    const ops = {
      payments: [{ id: 'PAY-123', status: 'pending_review' }],
    }

    expect(mergeProofStores(existing, incoming, ops)).toEqual(existing)
  })

  it('drops proofs once a payment is no longer pending review', () => {
    const existing = {
      'PAY-123': { name: 'proof.jpg', dataUrl: 'data:image/jpeg;base64,abc' },
    }
    const ops = {
      payments: [{ id: 'PAY-123', status: 'settled' }],
    }

    expect(mergeProofStores(existing, {}, ops)).toEqual({})
  })

  it('prefers a new incoming screenshot for the same pending payment', () => {
    const existing = {
      'PAY-123': { name: 'old.jpg', dataUrl: 'data:image/jpeg;base64,old' },
    }
    const incoming = {
      'PAY-123': { name: 'new.jpg', dataUrl: 'data:image/jpeg;base64,new' },
    }
    const ops = {
      payments: [{ id: 'PAY-123', status: 'pending_review' }],
    }

    expect(mergeProofStores(existing, incoming, ops)).toEqual(incoming)
  })
})
