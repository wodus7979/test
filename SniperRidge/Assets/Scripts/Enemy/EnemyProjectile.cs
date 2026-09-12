using UnityEngine;

namespace SniperRidge
{
    /// <summary>A fixed, visible flight path. Damage is decided at collision time, never at firing.</summary>
    public sealed class EnemyProjectile : MonoBehaviour
    {
        static readonly RaycastHit[] hitBuffer = new RaycastHit[32];
        GameManager gm;
        EnemySoldier owner;
        Vector3 position, direction;
        float speed, remaining, damage;
        bool cracked;
        LineRenderer line;

        public static void Launch(GameManager game, EnemySoldier shooter, Vector3 muzzle, Vector3 target, float damage)
        {
            float distance = Vector3.Distance(muzzle, target);
            if (distance < .01f) return;
            // Raycasts do not report the collider containing their origin. A weapon
            // embedded in its own cover must not spawn a round on the far side.
            foreach (var collider in Physics.OverlapSphere(muzzle, .025f, EnemyRagdoll.CombatMask, QueryTriggerInteraction.Ignore))
                if (shooter == null || !collider.transform.IsChildOf(shooter.transform)) return;
            var go = new GameObject("EnemyBullet");
            if(shooter!=null && shooter.Combat!=null)shooter.Combat.RecordShot();
            var bullet = go.AddComponent<EnemyProjectile>();
            bullet.gm = game;
            bullet.owner = shooter;
            bullet.position = muzzle;
            bullet.direction = (target - muzzle) / distance;
            bullet.speed = distance / CounterfireRules.FlightSeconds(distance);
            bullet.remaining = distance + 30f;
            bullet.damage = damage;
            go.transform.position = muzzle;
            bullet.line = go.AddComponent<LineRenderer>();
            bullet.line.useWorldSpace = true;
            bullet.line.positionCount = 2;
            bullet.line.SetPosition(0, muzzle);
            bullet.line.SetPosition(1, muzzle);
            bullet.line.startWidth = .09f;
            bullet.line.endWidth = .035f;
            bullet.line.sharedMaterial = Effects.Unlit(new Color(1f, .42f, .12f));
            bullet.line.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            bullet.line.receiveShadows = false;
            // Also bounds shots that miss terrain and fly out of the playable area.
            Destroy(go, 4f);
        }

        /// <summary>World obstruction, ignoring only the shooter's own colliders.</summary>
        public static bool WorldHit(Vector3 from, Vector3 to, EnemySoldier shooter, out RaycastHit nearest)
        {
            nearest = default;
            float distance = Vector3.Distance(from, to);
            if (distance < .00001f) return false;
            bool found = false;
            float best = distance + 1f;
            Vector3 direction = (to - from) / distance;
            int count = Physics.RaycastNonAlloc(from, direction, hitBuffer, distance, EnemyRagdoll.CombatMask, QueryTriggerInteraction.Ignore);
            // A full buffer is not guaranteed to contain the closest obstruction.
            // Fall back for unusually dense lines of sight rather than letting shots through.
            RaycastHit[] hits = count == hitBuffer.Length
                ? Physics.RaycastAll(from, direction, distance, EnemyRagdoll.CombatMask, QueryTriggerInteraction.Ignore) : hitBuffer;
            if (hits != hitBuffer) count = hits.Length;
            for (int i = 0; i < count; i++)
            {
                RaycastHit hit = hits[i];
                if (shooter != null && hit.collider.transform.IsChildOf(shooter.transform)) continue;
                if (hit.distance >= best) continue;
                nearest = hit;
                best = hit.distance;
                found = true;
            }
            return found;
        }

        // Player pose has already updated, including a same-frame duck or sidestep.
        void LateUpdate()
        {
            if (gm == null || !gm.IsPlaying) { Destroy(gameObject); return; }
            float distance = Mathf.Min(speed * Time.deltaTime, remaining);
            Vector3 next = position + direction * distance;
            bool blocked = WorldHit(position, next, owner, out RaycastHit obstacle);
            if(gm.Assault!=null && owner!=null)gm.Assault.NotifyIncoming(owner,position,blocked?obstacle.point:next);
            float wallDistance = blocked ? obstacle.distance : float.PositiveInfinity;
            gm.Player.GetDamageCapsule(out Vector3 bottom, out Vector3 top);
            float playerDistance = CounterfireRules.CapsuleHit(position, next, bottom, top, CounterfireRules.PlayerRadius);
            if ((owner==null||!owner.IsAlly) && !float.IsPositiveInfinity(playerDistance) && playerDistance < wallDistance)
            {
                gm.Health.TakeDamage(damage);
                Destroy(gameObject);
                return;
            }
            if (blocked)
            {
                var hitbox=obstacle.collider.GetComponent<EnemyHitbox>();
                if(hitbox!=null && hitbox.Owner!=null && owner!=null && hitbox.Owner.IsAlly!=owner.IsAlly)
                {
                    hitbox.Owner.TakeHit(damage,false,direction);
                    BloodImpact.Emit(obstacle.point,obstacle.normal,direction,false);
                }
                Effects.Dust(obstacle.point, obstacle.normal, .14f);
                Destroy(gameObject);
                return;
            }
            // A near miss is audible once; it does not subtract health.
            if (!cracked && !float.IsPositiveInfinity(CounterfireRules.CapsuleHit(position, next, bottom, top, 1.6f)))
            {
                cracked = true;
                gm.PlaySound(gm.Sounds.Crack, .35f, Random.Range(.95f, 1.05f));
            }
            line.SetPosition(0, next - direction * Mathf.Min(distance, 6f));
            line.SetPosition(1, next);
            position = next;
            transform.position = next;
            remaining -= distance;
            if (remaining <= 0f) Destroy(gameObject);
        }
    }
}
