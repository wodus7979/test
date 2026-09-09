using UnityEngine;

namespace SniperRidge
{
    public static class ExplosionDamage
    {
        public static void Detonate(Vector3 centre, float damage, Vector3 origin, EnemySoldier direct, string label)
        {
            var gm = GameManager.Instance;
            if (gm == null || !gm.IsPlaying) return;
            RocketEffects.Explosion(centre);
            var targets = RocketProjectile.FindBlastTargets(centre, damage, direct);
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
            Vector3 playerPoint = gm.Player.AimPoint;
            float distance = Vector3.Distance(centre, playerPoint);
            if (gm.IsPlaying && distance < RocketProjectile.BlastRadius &&
                !Physics.Linecast(centre, playerPoint, EnemyRagdoll.CombatMask, QueryTriggerInteraction.Ignore))
                gm.Health.TakeDamage(RocketProjectile.BlastDamage(distance, 80f));
            if (gm.IsPlaying)
                gm.Hud.ShowShotFeedback(kills > 0 ? label + " 폭발 · " + kills + "명 처치" :
                    counted ? label + " 명중 · 적 생존" : label + " 폭발 · 적 명중 없음");
        }
    }
}
