export type AgendaDay = {
  date: string;
  start_time: string | null;
  shift_admin: string | null;
  daily_goal: number | null;
  promo: string | null;
  discount_pct: number | null;
  discount_category: string | null;
  event: string | null;
  updated_at: string;
} | null;

export type WeeklyGoal = { week_monday: string; goal: number } | null;

export type Shift = {
  id: string;
  date: string;
  person_name: string;
  user_id: string | null;
  area: string | null;
  schedule_label: string | null;
  shift_type: "mesa" | "cocina";
  cleaning_task: string | null;
  done: boolean;
  created_at: string;
};

export type WorkType = "mesero" | "cocinero" | "administracion";

export type Attendance = {
  id: number;
  user_id: string;
  date: string;
  work_type: WorkType;
  check_in: string | null;
  check_out: string | null;
  method: "auto" | "manual";
  corrected_by: string | null;
};

export type Bonus = {
  date: string;
  user_id: string;
  service: boolean | null;
  task_alistamiento: boolean | null;
  task_inventario: boolean | null;
  task_apertura: boolean | null;
  task_cierre: boolean | null;
  rated_by: string | null;
  updated_at: string;
};

export type ServiceRating = { user_id: string; rating: "bien" | "regular" | "mal" };

export type DefaultTask = { weekday: number; shift_type: "mesa" | "cocina"; task: string };
export type MenuCategory = { id: string; label: string; sort_order: number };
export type UserRow = {
  id: string;
  name: string;
  active: boolean;
  role: "jefe" | "staff";
  subrole: "mesero" | "cocinero" | null;
};
