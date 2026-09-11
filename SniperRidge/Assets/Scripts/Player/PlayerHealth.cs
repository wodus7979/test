using UnityEngine;

namespace SniperRidge
{
    public class PlayerHealth : MonoBehaviour
    {
        public float Max = 100f;
        public float Current { get; private set; } = 100f;
        public float Fraction => Current / Max;

        float regenDelay = 5f, regenRate = 6f;
        float lastHitTime = -99f;

        public void Configure(float delay, float rate)
        {
            regenDelay = delay;
            regenRate = rate;
            Current = Max;
        }

        public void TakeDamage(float amount)
        {
            var gm = GameManager.Instance;
            if (gm == null || !gm.IsPlaying) return;
            Current = Mathf.Max(0f, Current - amount);
            lastHitTime = Time.time;
            gm.Hud.FlashDamage();
            gm.PlaySound(gm.Sounds.Crack, 0.9f, 0.8f);
            if (Current <= 0f) gm.PlayerDied();
        }

        void Update()
        {
            var gm = GameManager.Instance;
            if (gm != null && gm.IsPlaying && (gm.Player.IsHidden || gm.Player.IsMounted) && Current > 0f && Current < Max && Time.time - lastHitTime > regenDelay)
                Current = Mathf.Min(Max, Current + regenRate * Time.deltaTime);
        }
    }
}
