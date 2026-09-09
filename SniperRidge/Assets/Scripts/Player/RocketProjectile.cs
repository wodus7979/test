using System.Collections.Generic;
using UnityEngine;

namespace SniperRidge
{
    /// <summary>Game projectile: constant-speed flight, swept collision, cover-aware radial damage.</summary>
    [DefaultExecutionOrder(310)]
    public sealed class RocketProjectile : MonoBehaviour
    {
        public const float BlastRadius = 7f;
        const float CollisionRadius = .06f;
        Vector3 eye, aim, muzzle, velocity, origin;
        float damage, speed, age;
        bool launched, done;
        ParticleSystem smoke;

        public static void Fire(Vector3 eye, Vector3 aim, Vector3 muzzle, WeaponDefinition weapon)
        {
            var go = new GameObject("RocketProjectile");
            go.transform.position = muzzle;
            var rocket = go.AddComponent<RocketProjectile>();
            rocket.eye = rocket.origin = eye;
            rocket.aim = aim.normalized;
            rocket.muzzle = muzzle;
            rocket.damage = weapon.Damage;
            rocket.speed = weapon.MuzzleVelocity;
        }

        void LateUpdate()
        {
            var gm = GameManager.Instance;
            if (done || gm == null || !gm.IsPlaying) { Destroy(gameObject); return; }
            Bullet.SyncHitboxesForShot();
            if (!launched)
            {
                launched = true;
                // Check the whole camera-to-muzzle segment so a barrel clipping a wall cannot fire through it.
                Vector3 reach = muzzle - eye;
                if (Physics.SphereCast(eye, CollisionRadius, reach.normalized, out RaycastHit blocked,
                    reach.magnitude, EnemyRagdoll.CombatMask, QueryTriggerInteraction.Ignore))
                { Detonate(blocked.point, blocked.normal, blocked.collider); return; }
                var overlaps = Physics.OverlapSphere(muzzle, CollisionRadius, EnemyRagdoll.CombatMask, QueryTriggerInteraction.Ignore);
                if (overlaps.Length > 0)
                { Detonate(muzzle, -aim, overlaps[0]); return; }
                Vector3 target = Physics.Raycast(eye, aim, out RaycastHit sight, 1500f, EnemyRagdoll.CombatMask, QueryTriggerInteraction.Ignore)
                    ? sight.point : eye + aim * 1500f;
                velocity = (target - muzzle).normalized * speed;
                transform.rotation = Quaternion.LookRotation(velocity);
                RocketEffects.BuildBody(transform);
                smoke = RocketEffects.Trail(transform);
            }
            age += Time.deltaTime;
            if (age > 10f) { Destroy(gameObject); return; }
            Vector3 step = velocity * Time.deltaTime;
            if (step.sqrMagnitude <= .000001f) return;
            if (Physics.SphereCast(transform.position, CollisionRadius, step.normalized, out RaycastHit hit,
                step.magnitude, EnemyRagdoll.CombatMask, QueryTriggerInteraction.Ignore))
            { Detonate(hit.point, hit.normal, hit.collider); return; }
            transform.position += step;
        }

        public static float BlastDamage(float distance, float maximum)
        {
            if (distance >= BlastRadius) return 0f;
            return maximum * (1f - Mathf.InverseLerp(2f, BlastRadius, distance));
        }

        // Every body collider may contribute a visibility sample, but each soldier receives damage once.
        public static Dictionary<EnemySoldier, float> FindBlastTargets(Vector3 centre, float maximum, EnemySoldier direct = null)
        {
            var targets = new Dictionary<EnemySoldier, float>();
            foreach (Collider collider in Physics.OverlapSphere(centre, BlastRadius, EnemyRagdoll.CombatMask, QueryTriggerInteraction.Ignore))
            {
                var box = collider.GetComponent<EnemyHitbox>();
                if (box == null || box.Owner == null || box.Owner.IsDead) continue;
                Vector3 point = collider.ClosestPoint(centre);
                Vector3 segment = point - centre;
                if (segment.magnitude > .02f && Physics.Raycast(centre, segment.normalized, out RaycastHit obstacle,
                    segment.magnitude + .02f, EnemyRagdoll.CombatMask, QueryTriggerInteraction.Ignore))
                {
                    var visible = obstacle.collider.GetComponent<EnemyHitbox>();
                    if (visible == null || visible.Owner != box.Owner) continue;
                }
                float amount = BlastDamage(segment.magnitude, maximum);
                if (amount > 0f && (!targets.TryGetValue(box.Owner, out float previous) || amount > previous))
                    targets[box.Owner] = amount;
            }
            if (direct != null && !direct.IsDead) targets[direct] = maximum;
            return targets;
        }

        void Detonate(Vector3 point, Vector3 normal, Collider collider)
        {
            if (done) return;
            done = true;
            var gm = GameManager.Instance;
            Vector3 centre = point + normal * .12f;
            RocketEffects.Explosion(centre);
            var box = collider != null ? collider.GetComponent<EnemyHitbox>() : null;
            var targets = FindBlastTargets(centre, damage, box != null ? box.Owner : null);
            bool counted = false;
            int kills = 0;
            foreach (var target in targets)
            {
                bool killed = target.Key.TakeHit(target.Value, false, (target.Key.transform.position - centre).normalized);
                gm.OnEnemyHit(target.Key, false, Vector3.Distance(origin, centre), killed, !counted);
                counted = true;
                if (killed) kills++;
            }
            gm.PlaySound(gm.Sounds.RocketExplosion, Mathf.Clamp01(1.1f - Vector3.Distance(gm.PlayerEye.position, centre) / 900f));
            // Close blasts can injure the player; physical trench walls block blast line of sight.
            Vector3 playerPoint = gm.Player.AimPoint;
            float playerDistance = Vector3.Distance(centre, playerPoint);
            if (gm.IsPlaying && playerDistance < BlastRadius &&
                !Physics.Linecast(centre, playerPoint, EnemyRagdoll.CombatMask, QueryTriggerInteraction.Ignore))
                gm.Health.TakeDamage(BlastDamage(playerDistance, 80f));
            if (gm.IsPlaying)
                gm.Hud.ShowShotFeedback(kills > 0 ? "로켓 폭발 · " + kills + "명 처치" :
                    counted ? "폭발 명중 · 적 생존" : "로켓 폭발 · 적 명중 없음");
            Destroy(gameObject);
        }

        void OnDestroy()
        {
            if (smoke == null) return;
            smoke.transform.SetParent(null, true);
            smoke.Stop(true, ParticleSystemStopBehavior.StopEmitting);
            Destroy(smoke.gameObject, 3f);
        }
    }
}
