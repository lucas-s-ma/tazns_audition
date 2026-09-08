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
import { ratingLabel, sections, type Candidate, type Evaluation } from '@/lib/domain';
const lanes = ['UNDECIDED', ...sections, 'REJECTED'];
function Card({ candidate: c, team }: { candidate: Candidate; team?: Evaluation }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: c.id });
  return (
    <article
      ref={setNodeRef}
      className={`board-card ${isDragging ? 'dragging' : ''}`}
      style={{ transform: CSS.Translate.toString(transform) }}
    >
      <div className="card-heading">
        <a href={`/deliberation/${c.id}`} className="card-name">
          {c.first_name} {c.last_name}
        </a>
        <button
          {...attributes}
          {...listeners}
          className="drag-handle"
          aria-label={`Drag ${c.first_name} ${c.last_name}`}
        >
          <GripVertical size={18} />
        </button>
      </div>
      <p>
        {c.class_year ?? 'Class unset'} · {c.mbti.replaceAll('_', '·')}
      </p>
      <p>
        Primary: {c.primary_section ?? 'Unset'}
        <br />
        Secondary: {c.secondary_section ?? 'Unset'}
      </p>
      <div className={`team-overall saturated ${team?.overall_rating?.toLowerCase() ?? 'grey'}`}>
        Team Overall <b>{ratingLabel(team?.overall_rating ?? null)}</b>
      </div>
    </article>
  );
}
function Lane({
  lane,
  candidates,
  team,
}: {
  lane: string;
  candidates: Candidate[];
  team: Evaluation[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: lane });
  return (
    <section ref={setNodeRef} className={`board-lane ${isOver ? 'over' : ''}`}>
      <h3>
        {lane === 'UNDECIDED' ? 'Undecided' : lane === 'REJECTED' ? 'Rejected' : lane}
        <span>{candidates.length}</span>
      </h3>
      {candidates.map((c) => (
        <Card key={c.id} candidate={c} team={team.find((t) => t.candidate_id === c.id)} />
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
          />
        ))}
      </div>
    </DndContext>
  );
}
