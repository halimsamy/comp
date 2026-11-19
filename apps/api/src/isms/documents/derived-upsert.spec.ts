import { keyByProvenance, upsertDerivedRows } from './derived-upsert';

type Row = { derivedFrom: string | null; text: string };

function handlers() {
  return {
    update: jest.fn().mockResolvedValue({}),
    createMany: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockResolvedValue({}),
  };
}

describe('keyByProvenance', () => {
  it('numbers repeated provenance keys by occurrence', () => {
    const keys = keyByProvenance([
      { derivedFrom: 'wizard:objective' },
      { derivedFrom: 'vendors' },
      { derivedFrom: 'wizard:objective' },
      { derivedFrom: null },
    ]).map((entry) => entry.key);
    expect(keys).toEqual(['wizard:objective#0', 'vendors#0', 'wizard:objective#1', null]);
  });
});

describe('upsertDerivedRows (#37)', () => {
  it('updates a derived row in place instead of deleting it', async () => {
    const h = handlers();
    await upsertDerivedRows<Row>({
      derived: [{ derivedFrom: 'vendors', text: 'new text' }],
      existing: [{ id: 'r1', source: 'derived', derivedFrom: 'vendors', position: 3 }],
      ...h,
    });
    expect(h.update).toHaveBeenCalledWith({
      id: 'r1',
      row: { derivedFrom: 'vendors', text: 'new text' },
    });
    expect(h.deleteMany).not.toHaveBeenCalled();
    expect(h.createMany).not.toHaveBeenCalled();
  });

  it('skips a derived row whose slot holds a manual edit', async () => {
    const h = handlers();
    await upsertDerivedRows<Row>({
      derived: [{ derivedFrom: 'vendors', text: 'generated' }],
      existing: [{ id: 'r1', source: 'manual', derivedFrom: 'vendors', position: 0 }],
      ...h,
    });
    expect(h.update).not.toHaveBeenCalled();
    expect(h.createMany).not.toHaveBeenCalled();
    expect(h.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes derived rows no longer produced and appends new ones', async () => {
    const h = handlers();
    await upsertDerivedRows<Row>({
      derived: [{ derivedFrom: 'members', text: 'workforce' }],
      existing: [
        { id: 'm1', source: 'manual', derivedFrom: null, position: 0 },
        { id: 'r1', source: 'derived', derivedFrom: 'devices', position: 1 },
      ],
      ...h,
    });
    expect(h.deleteMany).toHaveBeenCalledWith(['r1']);
    expect(h.createMany).toHaveBeenCalledWith([
      { row: { derivedFrom: 'members', text: 'workforce' }, position: 2 },
    ]);
  });

  it('matches repeated keys by occurrence', async () => {
    const h = handlers();
    await upsertDerivedRows<Row>({
      derived: [
        { derivedFrom: 'wizard:objective', text: 'a' },
        { derivedFrom: 'wizard:objective', text: 'b' },
      ],
      existing: [
        { id: 'o1', source: 'manual', derivedFrom: 'wizard:objective', position: 0 },
        { id: 'o2', source: 'derived', derivedFrom: 'wizard:objective', position: 1 },
      ],
      ...h,
    });
    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.update).toHaveBeenCalledWith({
      id: 'o2',
      row: { derivedFrom: 'wizard:objective', text: 'b' },
    });
  });
});
