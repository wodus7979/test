using UnityEngine;

namespace SniperRidge
{
    public class PlayerHealth : MonoBehaviour
    {
        public float Max = 100f;
        public float Current { get; private set; } = 100f;
        public float Fraction => Current / Max;

        float lastHitTime = -99f;

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
            if (Current > 0f && Current < Max && Time.time - lastHitTime > 5f)
                Current = Mathf.Min(Max, Current + 6f * Time.deltaTime);
        }
    }
}
