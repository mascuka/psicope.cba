-- El asistente de Instagram dejó de citar Wikipedia (la clienta pidió
-- fuentes de evidencia científica real: neurociencias, neuropsicología,
-- paradigma de la neurodiversidad) -- la columna ya no debe seguir
-- llamándose "fuente_wikipedia".
alter table public.asistente_ig_posts rename column fuente_wikipedia to fuente_cientifica;
