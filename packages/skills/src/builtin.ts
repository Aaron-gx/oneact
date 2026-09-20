import { academicDefense } from "./builtin/academic-defense.js";
import { appleMinimal } from "./builtin/apple-minimal.js";
import { businessReport } from "./builtin/business-report.js";
import { consultingPro } from "./builtin/consulting-pro.js";
import { education } from "./builtin/education.js";
import { finance } from "./builtin/finance.js";
import { magazine } from "./builtin/magazine.js";
import { medical } from "./builtin/medical.js";
import { productLaunch } from "./builtin/product-launch.js";
import { roadmap } from "./builtin/roadmap.js";
import { startupPitch } from "./builtin/startup-pitch.js";
import { techKeynote } from "./builtin/tech-keynote.js";
import type { Skill } from "./types.js";

/**
 * 内置官方 skill（与用户导入的 skill 同构，统一经 composeSkills / applySkill 处理）。
 * 12 个：structure×5（路演/汇报/答辩/发布会/路线图）+ style×4（Apple极简/咨询/科技/杂志）+ domain×3（金融/医疗/教育）。
 */
export const BUILTIN_SKILLS: Skill[] = [
  startupPitch,
  businessReport,
  academicDefense,
  productLaunch,
  appleMinimal,
  consultingPro,
  techKeynote,
  finance,
  medical,
  education,
  roadmap,
  magazine,
];
