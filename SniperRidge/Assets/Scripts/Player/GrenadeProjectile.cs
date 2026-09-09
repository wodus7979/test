using UnityEngine;

namespace SniperRidge
{
    [DefaultExecutionOrder(330)]
    public sealed class GrenadeProjectile : MonoBehaviour
    {
        GrenadeTrajectory.State state;
        Vector3 throwOrigin, previousPosition;
        Transform visual;
        float accumulator;
        int steps;

        public static GameObject CreateVisual(Transform parent)
        {
            var prefab = Resources.Load<GameObject>("Grenades/Prefabs/grenade_olive");
            if (prefab == null) return null;
            var model = Instantiate(prefab, parent, false);
            foreach (var collider in model.GetComponentsInChildren<Collider>(true))
            { collider.enabled = false; Destroy(collider); }
            var marker = model.transform.Find("EffectOrigin");
            if (marker != null) model.transform.localPosition = -marker.localPosition;
            var lod = model.GetComponent<LODGroup>(); if (lod != null) lod.ForceLOD(0);
            return model;
        }

        public static void Throw(Vector3 origin, Vector3 velocity, Vector3 playerOrigin)
        {
            var go = new GameObject("ThrownGrenade");
            go.transform.position = origin;
            var projectile = go.AddComponent<GrenadeProjectile>();
            projectile.state = new GrenadeTrajectory.State { Position = origin, Velocity = velocity };
            projectile.throwOrigin = playerOrigin;
            projectile.previousPosition = origin;
            var spin = new GameObject("Spin").transform; spin.SetParent(go.transform, false);
            projectile.visual = spin;
            CreateVisual(spin);
        }

        void LateUpdate()
        {
            var gm = GameManager.Instance;
            if (gm == null || !gm.IsPlaying) { Destroy(gameObject); return; }
            Bullet.SyncHitboxesForShot();
            accumulator += Time.deltaTime;
            while (accumulator >= GrenadeTrajectory.StepSeconds && steps < GrenadeTrajectory.FuseSteps)
            {
                previousPosition = state.Position;
                GrenadeTrajectory.Step(ref state);
                accumulator -= GrenadeTrajectory.StepSeconds;
                steps++;
            }
            transform.position = Vector3.Lerp(previousPosition, state.Position, accumulator / GrenadeTrajectory.StepSeconds);
            if (!state.Resting) visual.Rotate(new Vector3(490f, 210f, 120f) * Time.deltaTime, Space.Self);
            if (steps >= GrenadeTrajectory.FuseSteps)
            {
                ExplosionDamage.Detonate(state.Position, 180f, throwOrigin, null, "수류탄");
                Destroy(gameObject);
            }
        }
    }
}
