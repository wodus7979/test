using System.Collections.Generic;
using UnityEngine;

namespace SniperRidge
{
    /// <summary>Authored locomotion plus procedural aiming, planted-foot crouching and reactions.</summary>
    [DefaultExecutionOrder(150)]
    public class EnemyAnimationRig : MonoBehaviour
    {
        public const int CurrentVersion = 4;
        public const float WalkReferenceSpeed = 1.4f;
        public const float RunReferenceSpeed = 4.2f;
        public int SetupVersion;
        public Transform AnimatedHead => head;

        EnemySoldier owner;
        Animator animator;
        Terrain terrain;
        Transform bodyRig, hips, chest, neck, head;
        Transform leftThigh, leftKnee, leftFoot, rightThigh, rightKnee, rightFoot;
        Transform leftArm, leftElbow, leftHand, rightArm, rightElbow, rightHand, weapon;
        Transform[] bones, groundProbeBones;
        Vector3[] deathPositions;
        Quaternion[] deathRotations;
        Quaternion rigRestRotation;
        Vector3 rigRestPosition;
        float unitScale, crouch, aim, reaction, recoil, reactionSide, phase;
        float coverExposure;
        int coverSide = 1;
        Vector3 leftPlant, rightPlant;
        Vector3 previousHips;
        bool hasHipsSample;
        public Vector3 AnimatedVelocity { get; private set; }
        Quaternion leftGripRotation, rightGripRotation, leftPlantRotation, rightPlantRotation;
        bool UsesCover => owner != null && (owner.Kind == EnemyKind.Tree || owner.Kind == EnemyKind.Cover);
        public bool CanFireFromPose => !UsesCover || EnemyCoverPose.Sample(owner.Kind == EnemyKind.Tree, coverExposure, coverSide).CanFire;
        float leftSole, rightSole, deathTime, fallSide;
        bool ready, dead;
        Vector3 aimTarget;

        class HitShape
        {
            public Transform start, end, shape;
            public CapsuleCollider capsule;
            public float radius;
            public float endOffset;
        }
        readonly List<HitShape> hitShapes = new List<HitShape>();

        Transform FindBone(string name)
        {
            foreach (var t in GetComponentsInChildren<Transform>(true))
                if (t.name.Replace(":", "").Replace("_", "").ToLowerInvariant().EndsWith(name.ToLowerInvariant())) return t;
            return null;
        }

        public bool Initialize(EnemySoldier soldier, Transform rig, Terrain ground, Transform rifle)
        {
            owner = soldier; bodyRig = rig; terrain = ground; weapon = rifle;
            animator = GetComponent<Animator>();
            hips = FindBone("Hips"); chest = FindBone("Spine2"); neck = FindBone("Neck"); head = FindBone("Head");
            leftThigh = FindBone("LeftUpLeg"); leftKnee = FindBone("LeftLeg"); leftFoot = FindBone("LeftFoot");
            rightThigh = FindBone("RightUpLeg"); rightKnee = FindBone("RightLeg"); rightFoot = FindBone("RightFoot");
            leftArm = FindBone("LeftArm"); leftElbow = FindBone("LeftForeArm"); leftHand = FindBone("LeftHand");
            rightArm = FindBone("RightArm"); rightElbow = FindBone("RightForeArm"); rightHand = FindBone("RightHand");
            if (animator == null || animator.runtimeAnimatorController == null || hips == null || chest == null || head == null ||
                leftThigh == null || leftKnee == null || leftFoot == null || rightThigh == null || rightKnee == null || rightFoot == null ||
                leftArm == null || leftElbow == null || leftHand == null || rightArm == null || rightElbow == null || rightHand == null)
            {
                Debug.LogError("[Sniper Ridge] 병사 뼈/Animator 연결이 누락되었습니다. 적 애니메이션 다시 생성 메뉴를 실행하세요.");
                enabled = false;
                return false;
            }
            unitScale = Mathf.Max(.01f, owner.transform.lossyScale.y);
            phase = Random.value * Mathf.PI * 2f;
            animator.enabled = true;
            animator.applyRootMotion = false;
            animator.cullingMode = AnimatorCullingMode.AlwaysAnimate;
            animator.Rebind();
            animator.SetFloat("MotionRate", 1f);
            animator.Play("Locomotion", 0, Random.value);
            animator.Update(0f);
            bones = GetComponentsInChildren<Transform>();
            groundProbeBones = new[] { hips, chest, head, leftKnee, rightKnee, leftFoot, rightFoot, leftHand, rightHand };
            rigRestRotation = bodyRig.localRotation;
            rigRestPosition = bodyRig.localPosition;
            leftSole = Mathf.Clamp((leftFoot.position.y - owner.transform.position.y) / unitScale, .04f, .15f);
            rightSole = Mathf.Clamp((rightFoot.position.y - owner.transform.position.y) / unitScale, .04f, .15f);

            leftPlant = owner.transform.InverseTransformPoint(leftFoot.position);
            rightPlant = owner.transform.InverseTransformPoint(rightFoot.position);
            leftPlantRotation = Quaternion.Inverse(owner.transform.rotation) * leftFoot.rotation;
            rightPlantRotation = Quaternion.Inverse(owner.transform.rotation) * rightFoot.rotation;

            if (weapon != null)
            {
                // Assault pack grip centre, measured from its source mesh (+Z barrel axis).
                weapon.rotation = owner.transform.rotation;
                weapon.position = rightHand.position - weapon.TransformVector(new Vector3(0f, -.05f, -.17f));
                rightGripRotation = Quaternion.Inverse(weapon.rotation) * rightHand.rotation;
                leftGripRotation = Quaternion.Inverse(weapon.rotation) * leftHand.rotation;
                weapon.SetParent(rightHand, true);
            }
            ready = true;
            return true;
        }

        public void BindHitboxes(IEnumerable<GameObject> oldParts)
        {
            foreach (var part in oldParts)
            {
                var hit = part.GetComponent<EnemyHitbox>();
                if (hit == null) continue;
                var collider = part.GetComponent<Collider>();
                if (collider != null) collider.enabled = false;
            }
            // The head joint is near the base of the skull, not its centre. Extend
            // towards the crown so visible upper-head/helmet shots have a hit shape.
            AddHitShape("AnimatedHead", head, null, .16f, true, .12f);
            AddHitShape("AnimatedTorso", hips, chest, .23f, false);
            AddHitShape("LeftThighHit", leftThigh, leftKnee, .105f, false);
            AddHitShape("LeftShinHit", leftKnee, leftFoot, .09f, false);
            AddHitShape("RightThighHit", rightThigh, rightKnee, .105f, false);
            AddHitShape("RightShinHit", rightKnee, rightFoot, .09f, false);
            AddHitShape("LeftArmHit", leftArm, leftElbow, .075f, false);
            AddHitShape("LeftForearmHit", leftElbow, leftHand, .065f, false);
            if (rightArm != null && rightElbow != null)
            {
                AddHitShape("RightArmHit", rightArm, rightElbow, .075f, false);
                AddHitShape("RightForearmHit", rightElbow, rightHand, .065f, false);
            }
            UpdateHitboxes();
        }

        void AddHitShape(string name, Transform start, Transform end, float radius, bool isHead, float endOffset = 0f)
        {
            var go = new GameObject(name);
            go.transform.SetParent(owner.transform, false);
            var capsule = go.AddComponent<CapsuleCollider>();
            capsule.radius = radius; capsule.height = radius * 2f;
            var hit = go.AddComponent<EnemyHitbox>(); hit.Owner = owner; hit.IsHead = isHead;
            hitShapes.Add(new HitShape { start = start, end = end, shape = go.transform, capsule = capsule, radius = radius, endOffset = endOffset });
        }

        void UpdateHitboxes()
        {
            foreach (var h in hitShapes)
            {
                Vector3 a = h.start.position, b = h.end != null ? h.end.position : a + h.start.up * (h.endOffset * unitScale);
                h.shape.position = (a + b) * .5f;
                if ((b - a).sqrMagnitude > .00001f) h.shape.rotation = Quaternion.FromToRotation(Vector3.up, b - a);
                h.capsule.height = Vector3.Distance(a, b) / unitScale + h.radius * 2f;
            }
        }

        public void Drive(float worldSpeed, float coverAmount, float peekAmount, bool aiming, Vector3 target, float dt)
        {
            if (!ready || dead) return;
            float speed = worldSpeed / unitScale;
            animator.SetFloat("Speed", UsesCover ? 0f : speed, .12f, dt);
            animator.SetFloat("MotionRate", speed > RunReferenceSpeed ? Mathf.Clamp(speed / RunReferenceSpeed, 1f, 1.5f) : 1f);
            crouch = Mathf.MoveTowards(crouch, coverAmount, dt * 3f);
            coverExposure = 1f - Mathf.Clamp01(coverAmount);
            if (Mathf.Abs(peekAmount) > .01f) coverSide = peekAmount < 0f ? -1 : 1;
            // Keep the rifle raised during advancing fire instead of fading aiming to zero.
            aim = Mathf.MoveTowards(aim, aiming ? Mathf.Lerp(1f, .65f, Mathf.InverseLerp(.3f, 3f, speed)) : 0f, dt * 5f);
            aimTarget = target;
        }

        public void Fire() { if (ready && !dead) recoil = 1f; }
        public void Hit(Vector3 direction)
        {
            if (!ready || dead) return;
            reaction = 1f;
            reactionSide = Mathf.Sign(Vector3.Dot(direction, owner.transform.right));
        }
        public void Die(Vector3 direction, bool headshot, Vector3 movement)
        {
            if (!ready || dead) return;
            dead = true;
            animator.enabled = false;
            foreach (var h in hitShapes) h.capsule.enabled = false;
            // Transfer the exact current pose (including crouching and aiming) to joint physics.
            if (EnemyRagdoll.Begin(transform, owner.transform, weapon, movement, direction, headshot) != null)
            {
                enabled = false;
                return;
            }
            Debug.LogWarning("[Sniper Ridge] 물리 사망 동작에 필요한 뼈가 없어 기본 쓰러짐 동작을 사용합니다.");
            deathPositions = new Vector3[bones.Length]; deathRotations = new Quaternion[bones.Length];
            for (int i = 0; i < bones.Length; i++) { deathPositions[i] = bones[i].localPosition; deathRotations[i] = bones[i].localRotation; }
            fallSide = Vector3.Dot(direction, owner.transform.right) >= 0f ? 1f : -1f;
            animator.enabled = false;
            foreach (var h in hitShapes) h.capsule.enabled = false;
        }

        void Update()
        {
            if (!ready || dead) return;
            var game = GameManager.Instance;
            animator.speed = game != null && game.IsPlaying ? 1f : 0f;
        }

        void LateUpdate()
        {
            if (!ready || Time.deltaTime <= 0f) return;
            if (dead) { AnimateDeath(); return; }
            var game = GameManager.Instance;
            if (game == null || !game.IsPlaying) return;
            Vector3 leftTarget = FootTarget(leftFoot, leftSole), rightTarget = FootTarget(rightFoot, rightSole);
            Quaternion leftRotation = leftFoot.rotation, rightRotation = rightFoot.rotation;
            float raise = aim;
            if (UsesCover)
            {
                var pose = EnemyCoverPose.Sample(owner.Kind == EnemyKind.Tree, coverExposure, coverSide);
                // The foot targets come from a fixed stance, not the hip or animated root.
                // One foot stays planted while the other follows its lift-and-step arc.
                leftTarget = PlantedTarget(leftPlant, pose.LeftFoot, leftSole);
                rightTarget = PlantedTarget(rightPlant, pose.RightFoot, rightSole);
                leftRotation = Quaternion.AngleAxis(-140f * pose.LeftFoot.y, owner.transform.right) * owner.transform.rotation * leftPlantRotation;
                rightRotation = Quaternion.AngleAxis(-140f * pose.RightFoot.y, owner.transform.right) * owner.transform.rotation * rightPlantRotation;
                hips.position += owner.transform.TransformVector(pose.Pelvis);
                Rotate(hips, owner.transform.forward, pose.HipRoll);
                Rotate(chest, owner.transform.forward, pose.ChestRoll);
                Rotate(chest, owner.transform.right, pose.ChestPitch);
                Rotate(chest, Vector3.up, pose.ShoulderTurn);
                raise = pose.WeaponRaise;
            }
            else hips.position -= Vector3.up * (.66f * crouch * unitScale);
            float breathing = Mathf.Sin(Time.time * 1.7f + phase);
            Rotate(chest, owner.transform.right, .7f * breathing - 4f * recoil + 9f * reaction);
            Rotate(chest, owner.transform.forward, 5f * reaction * reactionSide);
            Vector3 direction = (aimTarget - chest.position).normalized;
            float pitch = Mathf.Clamp(Mathf.Asin(Mathf.Clamp(direction.y, -1f, 1f)) * Mathf.Rad2Deg, -25f, 35f) * aim;
            Vector3 flat = Vector3.ProjectOnPlane(direction, Vector3.up);
            float yaw = flat.sqrMagnitude > .001f ? Mathf.Clamp(Vector3.SignedAngle(owner.transform.forward, flat, Vector3.up), -40f, 40f) * aim : 0f;
            Rotate(chest, Vector3.up, yaw * .65f);
            Rotate(chest, owner.transform.right, -pitch * .65f);
            Rotate(neck, Vector3.up, yaw * .2f);
            Rotate(head, owner.transform.right, -pitch * .35f);
            if (aim < .1f) Rotate(head, Vector3.up, Mathf.Sin(Time.time * .7f + phase) * 3f);

            SolveLimb(leftThigh, leftKnee, leftFoot, leftTarget, leftThigh.position + owner.transform.forward * unitScale);
            SolveLimb(rightThigh, rightKnee, rightFoot, rightTarget, rightThigh.position + owner.transform.forward * unitScale);
            leftFoot.rotation = GroundRotation(leftTarget, leftRotation);
            rightFoot.rotation = GroundRotation(rightTarget, rightRotation);
            if (weapon != null) PoseRifle(direction, raise);
            reaction = Mathf.MoveTowards(reaction, 0f, Time.deltaTime * 5f);
            recoil = Mathf.MoveTowards(recoil, 0f, Time.deltaTime * 12f);
            AnimatedVelocity = hasHipsSample ? Vector3.ClampMagnitude((hips.position - previousHips) / Time.deltaTime, 9f * unitScale) : Vector3.zero;
            previousHips = hips.position;
            hasHipsSample = true;
            UpdateHitboxes();
        }

        Vector3 PlantedTarget(Vector3 rest, Vector3 step, float sole)
        {
            Vector3 p = owner.transform.TransformPoint(new Vector3(rest.x + step.x, 0f, rest.z + step.z));
            p.y = TerrainGenerator.GroundHeight(terrain, p.x, p.z) + (sole + step.y) * unitScale;
            return p;
        }

        void PoseRifle(Vector3 direction, float raise)
        {
            float weight = UsesCover ? 1f : aim;
            if (weight <= .001f) return;
            Vector3 forward = direction.sqrMagnitude > .001f ? direction : owner.transform.forward;
            Quaternion pointing = Quaternion.LookRotation(forward, Vector3.up);
            // Bring the stock to the shoulder as the body clears cover; lower it when hiding.
            pointing *= Quaternion.Euler(32f * (1f - raise), 0f, 0f);
            Vector3 shoulderGrip = chest.position + owner.transform.right * (.14f * unitScale)
                + Vector3.up * (Mathf.Lerp(-.24f, -.055f, raise) * unitScale)
                + forward * (.18f * unitScale) - forward * (.035f * recoil * unitScale);
            Vector3 rightTarget = Vector3.Lerp(rightHand.position, shoulderGrip, weight);
            SolveLimb(rightArm, rightElbow, rightHand, rightTarget,
                rightArm.position + owner.transform.right * unitScale - owner.transform.forward * (.3f * unitScale));
            Quaternion gunRotation = Quaternion.Slerp(weapon.rotation, pointing, weight);
            rightHand.rotation = gunRotation * rightGripRotation;
            weapon.rotation = gunRotation;
            weapon.position = rightHand.position - weapon.TransformVector(new Vector3(0f, -.05f, -.17f));
            SolveLimb(leftArm, leftElbow, leftHand, weapon.TransformPoint(0f, -.05f, .10f),
                leftArm.position - owner.transform.right * unitScale - owner.transform.forward * (.2f * unitScale));
            leftHand.rotation = gunRotation * leftGripRotation;
        }

        Vector3 FootTarget(Transform foot, float sole)
        {
            Vector3 p = foot.position;
            float lift = Mathf.Max(0f, p.y - owner.transform.position.y - sole * unitScale);
            p.y = TerrainGenerator.GroundHeight(terrain, p.x, p.z) + sole * unitScale + lift;
            return p;
        }
        Quaternion GroundRotation(Vector3 p, Quaternion authored)
        {
            var data = terrain.terrainData;
            Vector3 n = data.GetInterpolatedNormal((p.x - terrain.transform.position.x) / data.size.x, (p.z - terrain.transform.position.z) / data.size.z);
            return Quaternion.FromToRotation(Vector3.up, Vector3.Slerp(Vector3.up, n, .7f)) * authored;
        }
        static void Rotate(Transform bone, Vector3 axis, float angle)
        {
            if (bone != null) bone.rotation = Quaternion.AngleAxis(angle, axis) * bone.rotation;
        }

        /// <summary>Analytic two-bone IK, with reachable targets clamped to avoid flipped/overstretched knees.</summary>
        public static void SolveLimb(Transform upper, Transform lower, Transform tip, Vector3 target, Vector3 pole)
        {
            if (upper == null || lower == null || tip == null) return;
            Vector3 origin = upper.position;
            float a = Vector3.Distance(origin, lower.position), b = Vector3.Distance(lower.position, tip.position);
            Vector3 delta = target - origin;
            if (a < .0001f || b < .0001f || delta.sqrMagnitude < .000001f) return;
            float distance = Mathf.Clamp(delta.magnitude, Mathf.Abs(a - b) + .0001f, (a + b) * .999f);
            Vector3 direction = delta.normalized;
            Vector3 bend = Vector3.ProjectOnPlane(pole - origin, direction);
            if (bend.sqrMagnitude < .000001f) bend = Vector3.ProjectOnPlane(lower.position - origin, direction);
            if (bend.sqrMagnitude < .000001f) bend = Vector3.Cross(direction, Vector3.right);
            if (bend.sqrMagnitude < .000001f) bend = Vector3.Cross(direction, Vector3.up);
            float along = (a * a + distance * distance - b * b) / (2f * distance);
            float height = Mathf.Sqrt(Mathf.Max(0f, a * a - along * along));
            Vector3 knee = origin + direction * along + bend.normalized * height;
            upper.rotation = Quaternion.FromToRotation(lower.position - origin, knee - origin) * upper.rotation;
            lower.rotation = Quaternion.FromToRotation(tip.position - lower.position, origin + direction * distance - lower.position) * lower.rotation;
        }

        void AnimateDeath()
        {
            deathTime += Time.deltaTime;
            for (int i = 0; i < bones.Length; i++) { bones[i].localPosition = deathPositions[i]; bones[i].localRotation = deathRotations[i]; }
            bodyRig.localPosition = rigRestPosition;
            float collapse = Mathf.SmoothStep(0f, 1f, deathTime / .4f);
            float fall = Mathf.SmoothStep(0f, 1f, Mathf.Clamp01((deathTime - .1f) / .85f));
            bodyRig.localRotation = rigRestRotation;
            Rotate(chest, owner.transform.right, 24f * collapse);
            Rotate(leftThigh, owner.transform.right, -25f * collapse);
            Rotate(rightThigh, owner.transform.right, -18f * collapse);
            Rotate(leftKnee, owner.transform.right, 48f * collapse);
            Rotate(rightKnee, owner.transform.right, 38f * collapse);
            Rotate(leftArm, owner.transform.forward, -30f * collapse);
            Rotate(rightArm, owner.transform.forward, 25f * collapse);
            bodyRig.localRotation = rigRestRotation * Quaternion.Euler(18f * fall, 0f, -84f * fall * fallSide);
            float lift = 0f;
            foreach (var bone in groundProbeBones)
                lift = Mathf.Max(lift, TerrainGenerator.GroundHeight(terrain, bone.position.x, bone.position.z) + .09f * unitScale - bone.position.y);
            bodyRig.position += Vector3.up * lift;
            // The final skeletal pose is now stable; no ragdoll or per-frame work is required for corpses.
            if (deathTime >= 1.1f) enabled = false;
        }
    }
}
