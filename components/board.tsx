'use client';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { sections, type Candidate, type Evaluation } from '@/lib/domain';
const lanes = ['UNDECIDED', ...sections, 'REJECTED'];
function Card({
  candidate: c,
  team,
  onMove,
}: {
  candidate: Candidate;
  team?: Evaluation;
  onMove: (id: string, lane: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: c.id });
  return (
    <article
      ref={setNodeRef}
      className={`board-card ${isDragging ? 'dragging' : ''}`}
      style={{ transform: CSS.Translate.toString(transform) }}
    >
      <div className="card-top">
        <span className="order">{String(c.audition_order).padStart(2, '0')}</span>
        <button
          {...attributes}
          {...listeners}
          className="drag-handle"
          aria-label={`Drag ${c.first_name} ${c.last_name}`}
        >
          <GripVertical size={18} />
        </button>
      </div>
      <a href={`/deliberation/${c.id}`} className="card-name">
        {c.first_name} {c.last_name}
      </a>
      <p>
        {c.class_year ?? 'Class unset'} · {c.mbti.replaceAll('_', '·')}
      </p>
      <p>
        Primary: {c.primary_section ?? 'Unset'}
        <br />
        Secondary: {c.secondary_section ?? 'Unset'}
      </p>
      <p>
        {[
          c.origin_1 === 'Other' ? c.origin_1_other : c.origin_1,
          c.origin_2 === 'Other' ? c.origin_2_other : c.origin_2 === 'None' ? null : c.origin_2,
        ]
          .filter(Boolean)
          .join(' / ') || 'Origin unset'}
      </p>
      <div className={`team-overall saturated ${team?.overall_rating?.toLowerCase() ?? 'grey'}`}>
        Team Overall <b>{team?.overall_rating ?? 'UNSET'}</b>
      </div>
      <select
        aria-label={`Move ${c.first_name} ${c.last_name}`}
        value={c.deliberation_status === 'ACCEPTED' ? c.accepted_section! : c.deliberation_status}
        onChange={(e) => onMove(c.id, e.target.value)}
      >
        {lanes.map((l) => (
          <option key={l} value={l}>
            {l === 'UNDECIDED' ? 'Undecided' : l === 'REJECTED' ? 'Rejected' : `Accepted / ${l}`}
          </option>
        ))}
      </select>
    </article>
  );
}
function Lane({
  lane,
  candidates,
  team,
  onMove,
}: {
  lane: string;
  candidates: Candidate[];
  team: Evaluation[];
  onMove: (id: string, lane: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: lane });
  return (
    <section ref={setNodeRef} className={`board-lane ${isOver ? 'over' : ''}`}>
      <h3>
        {lane === 'UNDECIDED' ? 'Undecided' : lane === 'REJECTED' ? 'Rejected' : lane}
        <span>{candidates.length}</span>
      </h3>
      {candidates.map((c) => (
        <Card
          key={c.id}
          candidate={c}
          team={team.find((t) => t.candidate_id === c.id)}
          onMove={onMove}
        />
      ))}
      {!candidates.length && <p className="drop-hint">Drop a candidate here</p>}
    </section>
  );
}
export function Board({
  candidates,
  team,
  onMove,
}: {
  candidates: Candidate[];
  team: Evaluation[];
  onMove: (id: string, lane: string) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const end = (e: DragEndEvent) => {
    if (e.over) onMove(String(e.active.id), String(e.over.id));
  };
  return (
    <DndContext sensors={sensors} onDragEnd={end}>
      <div className="board">
        {lanes.map((l) => (
          <Lane
            key={l}
            lane={l}
            candidates={candidates.filter(
              (c) =>
                !c.excluded &&
                (c.deliberation_status === 'ACCEPTED'
                  ? c.accepted_section === l
                  : c.deliberation_status === l),
            )}
            team={team}
            onMove={onMove}
          />
        ))}
      </div>
    </DndContext>
  );
}
