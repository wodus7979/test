using System.Collections.Generic;
using UnityEngine;

namespace SniperRidge
{
    /// <summary>Unscaled physics proxies drive the skinned bones after the Animator releases them.</summary>
    [DefaultExecutionOrder(180)]
    public sealed class EnemyRagdoll : MonoBehaviour
    {
        // Corpse physics still collides with the world, but cannot intercept combat/visibility queries.
        public const int CorpseLayer = 2; // Unity's built-in Ignore Raycast layer.
        public const int CombatMask = Physics.DefaultRaycastLayers;
        public const int BodyCount = 15;
        public bool Settled { get; private set; }
        public int PhysicsBodyCount => bodies.Count;

        sealed class Part
        {
            public Transform bone;
            public Rigidbody body;
            public Collider collider;
        }
        readonly List<Part> bodies = new List<Part>();
        readonly List<Collider> colliders = new List<Collider>();
        Rigidbody droppedWeapon;
        float age, quietTime, size;
        static PhysicMaterial friction;

        static PhysicMaterial Friction
        {
            get
            {
                if (friction == null)
                    friction = new PhysicMaterial("Corpse friction") { dynamicFriction = .65f, staticFriction = .8f,
                        bounciness = 0f, frictionCombine = PhysicMaterialCombine.Average,
                        bounceCombine = PhysicMaterialCombine.Minimum };
                return friction;
            }
        }

        public static Transform FindBone(Transform skeleton, string suffix)
        {
            foreach (var bone in skeleton.GetComponentsInChildren<Transform>(true))
                if (bone.name.Replace(":", "").Replace("_", "").ToLowerInvariant().EndsWith(suffix.ToLowerInvariant())) return bone;
            return null;
        }

        public static readonly string[] RequiredBones = {
            "Hips", "Spine2", "Head", "LeftUpLeg", "LeftLeg", "LeftFoot", "RightUpLeg", "RightLeg", "RightFoot",
            "LeftArm", "LeftForeArm", "LeftHand", "RightArm", "RightForeArm", "RightHand"
        };

        public static bool CanBuild(Transform skeleton)
        {
            foreach (string bone in RequiredBones) if (FindBone(skeleton, bone) == null) return false;
            return true;
        }

        public static EnemyRagdoll Begin(Transform skeleton, Transform owner, Transform weapon,
            Vector3 movement, Vector3 hitDirection, bool headshot)
        {
            if (!CanBuild(skeleton)) return null;
            var go = new GameObject("DeathPhysics");
            go.transform.SetParent(owner, false);
            // The FBX and enemy parent may use very different scales; proxies always have world scale 1.
            Vector3 scale = owner.lossyScale;
            go.transform.localScale = new Vector3(1f / scale.x, 1f / scale.y, 1f / scale.z);
            var ragdoll = go.AddComponent<EnemyRagdoll>();
            ragdoll.size = Mathf.Max(.1f, Mathf.Abs(scale.y));
            ragdoll.Build(skeleton, owner, weapon, movement, hitDirection, headshot);
            return ragdoll;
        }

        void Build(Transform skeleton, Transform owner, Transform weapon, Vector3 movement, Vector3 hitDirection, bool headshot)
        {
            Transform hips = FindBone(skeleton, "Hips"), chest = FindBone(skeleton, "Spine2"), head = FindBone(skeleton, "Head");
            var pelvis = Box(hips, (hips.position + chest.position) * .5f - owner.up * (.09f * size),
                new Vector3(.29f, .22f, .22f) * size, owner.rotation, 14f);
            var torso = Capsule(chest, head.position - owner.up * (.12f * size), .18f, 20f);
            var skull = Box(head, head.position + head.up * (.13f * size),
                new Vector3(.25f, .30f, .25f) * size, head.rotation, 5f);
            Joint(torso, pelvis, owner, -35f, 35f, 25f, 25f);
            Joint(skull, torso, owner, -35f, 35f, 40f, 30f);
            foreach (string side in new[] { "Left", "Right" })
            {
                Transform thigh = FindBone(skeleton, side + "UpLeg"), knee = FindBone(skeleton, side + "Leg"), foot = FindBone(skeleton, side + "Foot");
                var upper = Capsule(thigh, knee.position, .10f, 8f);
                var lower = Capsule(knee, foot.position, .075f, 4f);
                var toes = FindBone(skeleton, side + "ToeBase");
                Vector3 footForward = toes != null ? (toes.position - foot.position).normalized : owner.forward;
                Quaternion footRotation = Quaternion.LookRotation(footForward, owner.up);
                var sole = Box(foot, foot.position + footForward * (.07f * size),
                    new Vector3(.14f, .10f, .28f) * size, footRotation, 1f);
                Joint(upper, pelvis, owner, -85f, 40f, 35f, 45f);
                Joint(lower, upper, owner, -5f, 110f, 8f, 8f);
                Joint(sole, lower, owner, -30f, 40f, 15f, 15f);
            }
            foreach (string side in new[] { "Left", "Right" })
            {
                Transform arm = FindBone(skeleton, side + "Arm"), elbow = FindBone(skeleton, side + "ForeArm"), hand = FindBone(skeleton, side + "Hand");
                var upper = Capsule(arm, elbow.position, .07f, 2.5f);
                var lower = Capsule(elbow, hand.position, .055f, 1.5f);
                // Use the existing arm direction so the hand follows the held pose without snapping.
                var palm = Capsule(hand, hand.position + (hand.position - elbow.position).normalized * (.12f * size), .055f, .5f);
                Joint(upper, torso, owner, -85f, 85f, 70f, 70f);
                Joint(lower, upper, owner, -10f, 100f, 15f, 15f);
                Joint(palm, lower, owner, -25f, 25f, 20f, 20f);
            }
            DropWeapon(weapon);
            // Every collider was created disabled. Ignore pairs before the first solver step.
            for (int i = 0; i < colliders.Count; i++) colliders[i].enabled = true;
            for (int i = 0; i < colliders.Count; i++) for (int j = i + 1; j < colliders.Count; j++)
                Physics.IgnoreCollision(colliders[i], colliders[j], true);
            Physics.SyncTransforms();
            Vector3 carry = Vector3.ClampMagnitude(Vector3.ProjectOnPlane(movement, Vector3.up), 7f * size) * .65f;
            Vector3 direction = hitDirection.sqrMagnitude > .001f ? hitDirection.normalized : -owner.forward;
            foreach (var part in bodies)
            {
                part.body.isKinematic = false;
                part.body.velocity = carry + direction * (.35f * size);
            }
            // A small localized reaction breaks balance; gravity does the falling, without launching the corpse.
            var struck = headshot ? skull.body : torso.body;
            struck.AddForce(direction * (.75f * size), ForceMode.VelocityChange);
            pelvis.body.AddTorque(owner.forward * Random.Range(-.4f, .4f) + owner.right * .25f, ForceMode.VelocityChange);
            if (droppedWeapon != null)
            {
                droppedWeapon.isKinematic = false;
                droppedWeapon.velocity = carry + direction * (.25f * size);
                droppedWeapon.angularVelocity = owner.right * 1.5f;
            }
        }

        Part Body(Transform bone, float mass)
        {
            var proxy = new GameObject("Ragdoll_" + bone.name); proxy.layer = CorpseLayer;
            proxy.transform.SetParent(transform, false);
            proxy.transform.SetPositionAndRotation(bone.position, bone.rotation);
            var rb = proxy.AddComponent<Rigidbody>();
            Configure(rb, mass);
            var part = new Part { bone = bone, body = rb };
            bodies.Add(part);
            return part;
        }

        void Configure(Rigidbody body, float mass)
        {
            body.isKinematic = true;
            body.mass = mass; body.drag = .15f; body.angularDrag = .8f;
            body.interpolation = RigidbodyInterpolation.Interpolate;
            body.collisionDetectionMode = CollisionDetectionMode.ContinuousSpeculative;
            body.solverIterations = 12; body.solverVelocityIterations = 4;
            body.maxAngularVelocity = 9f; body.maxDepenetrationVelocity = 2f * size;
        }

        Part Capsule(Transform bone, Vector3 end, float radius, float mass)
        {
            var part = Body(bone, mass);
            // Child collider aligned to its segment; the proxy itself keeps the original bone orientation.
            var shape = new GameObject("BodyShape"); shape.layer = CorpseLayer;
            shape.transform.SetParent(part.body.transform, false);
            shape.transform.position = (bone.position + end) * .5f;
            shape.transform.rotation = Quaternion.FromToRotation(Vector3.up, end - bone.position);
            var collider = shape.AddComponent<CapsuleCollider>(); collider.enabled = false;
            collider.radius = radius * size;
            collider.height = Mathf.Max(Vector3.Distance(bone.position, end), collider.radius * 2f);
            AddCollider(part, collider);
            return part;
        }

        Part Box(Transform bone, Vector3 centre, Vector3 dimensions, Quaternion rotation, float mass)
        {
            var part = Body(bone, mass);
            var shape = new GameObject("BodyShape"); shape.layer = CorpseLayer;
            shape.transform.SetParent(part.body.transform, false);
            shape.transform.SetPositionAndRotation(centre, rotation);
            var collider = shape.AddComponent<BoxCollider>(); collider.enabled = false; collider.size = dimensions;
            AddCollider(part, collider);
            return part;
        }

        void AddCollider(Part part, Collider collider)
        {
            collider.sharedMaterial = Friction; collider.contactOffset = .008f * size;
            part.collider = collider; colliders.Add(collider);
        }

        void Joint(Part child, Part parent, Transform owner, float low, float high, float swing, float twist)
        {
            var joint = child.body.gameObject.AddComponent<ConfigurableJoint>();
            joint.connectedBody = parent.body;
            joint.autoConfigureConnectedAnchor = false;
            joint.anchor = Vector3.zero;
            joint.connectedAnchor = parent.body.transform.InverseTransformPoint(child.body.position);
            joint.axis = child.body.transform.InverseTransformDirection(owner.right);
            joint.secondaryAxis = child.body.transform.InverseTransformDirection(owner.up);
            joint.xMotion = joint.yMotion = joint.zMotion = ConfigurableJointMotion.Locked;
            joint.angularXMotion = joint.angularYMotion = joint.angularZMotion = ConfigurableJointMotion.Limited;
            joint.lowAngularXLimit = new SoftJointLimit { limit = low };
            joint.highAngularXLimit = new SoftJointLimit { limit = high };
            joint.angularYLimit = new SoftJointLimit { limit = swing };
            joint.angularZLimit = new SoftJointLimit { limit = twist };
            joint.projectionMode = JointProjectionMode.PositionAndRotation;
            joint.projectionDistance = .04f * size; joint.projectionAngle = 12f;
            joint.enableCollision = false; joint.enablePreprocessing = false;
        }

        void DropWeapon(Transform weapon)
        {
            if (weapon == null) return;
            // Stay under the corpse root so scene restart / corpse cleanup also removes the dropped rifle.
            weapon.SetParent(transform, true);
            foreach (var child in weapon.GetComponentsInChildren<Transform>(true)) child.gameObject.layer = CorpseLayer;
            droppedWeapon = weapon.gameObject.AddComponent<Rigidbody>(); Configure(droppedWeapon, 3.5f);
            var collider = weapon.gameObject.AddComponent<BoxCollider>(); collider.enabled = false;
            collider.center = new Vector3(0f, .015f, .07f); collider.size = new Vector3(.11f, .16f, .9f);
            collider.sharedMaterial = Friction; colliders.Add(collider);
        }

        void LateUpdate() => AdvancePose(Time.deltaTime);

        // Also used by the isolated Play-mode physics validation fixture.
        public void AdvancePose(float dt)
        {
            if (Settled || dt <= 0f) return;
            age += dt;
            CopyPose();
            bool quiet = true;
            foreach (var part in bodies)
                if (!part.body.IsSleeping() && (part.body.velocity.sqrMagnitude > .0144f * size * size ||
                    part.body.angularVelocity.sqrMagnitude > .09f)) { quiet = false; break; }
            if (droppedWeapon != null && !droppedWeapon.IsSleeping() &&
                (droppedWeapon.velocity.sqrMagnitude > .0144f * size * size || droppedWeapon.angularVelocity.sqrMagnitude > .09f)) quiet = false;
            quietTime = quiet ? quietTime + dt : 0f;
            if (age > 1.5f && quietTime > .8f) Settle();
        }

        void CopyPose()
        {
            // Build order is parent-first. Render bones follow physics, never feed animated transforms back to it.
            foreach (var part in bodies)
                if (part.bone != null) part.bone.SetPositionAndRotation(part.body.transform.position, part.body.transform.rotation);
        }

        void Settle()
        {
            foreach (var part in bodies)
            {
                part.body.velocity = part.body.angularVelocity = Vector3.zero;
                part.body.isKinematic = true;
            }
            if (droppedWeapon != null) { droppedWeapon.velocity = droppedWeapon.angularVelocity = Vector3.zero; droppedWeapon.isKinematic = true; }
            CopyPose();
            Settled = true;
            enabled = false;
        }
    }
}
