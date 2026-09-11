using UnityEngine;

namespace SniperRidge
{
    public enum EnemyRole { Automatic, MachineGunner, Sniper }

    public static class EnemyCombatRoles
    {
        public const int GunnerColors = 3;
        public const float BurstInterval = .11f;
        public static EnemyRole Resolve(EnemySpawn spawn) => spawn.Role != EnemyRole.Automatic ? spawn.Role :
            (spawn.Kind == EnemyKind.Cover || spawn.Kind == EnemyKind.Tree ? EnemyRole.Sniper : EnemyRole.MachineGunner);
        public static string Name(EnemyRole role) => role == EnemyRole.Sniper ? "저격병" : "기관총병";
        public static string Model(EnemyRole role) => role == EnemyRole.Sniper ? "01_precision_rifle" : "02_light_machine_gun";
        public static string Sound(EnemyRole role) => role == EnemyRole.Sniper ? "sniper" : "lmg";
        public static int Rounds(EnemyRole role) => role == EnemyRole.Sniper ? 1 : 3;
        public static float AimTime(EnemyRole role) => role == EnemyRole.Sniper ? 1.2f : .55f;
        public static Vector3 RightGrip(EnemyRole role) => role == EnemyRole.Sniper
            ? new Vector3(0f, -.048f, -.207f) : new Vector3(0f, -.036f, -.211f);
        public static Vector3 LeftGrip(EnemyRole role) => role == EnemyRole.Sniper
            ? new Vector3(0f, .012f, .08f) : new Vector3(0f, .015f, .065f);

        public static Color Uniform(EnemyRole role, int variant)
        {
            if (role == EnemyRole.Sniper) return new Color(.58f, .25f, .32f);
            switch (Mathf.Clamp(variant, 0, GunnerColors - 1))
            {
                case 0: return new Color(.37f, .56f, .29f);
                case 1: return new Color(.83f, .70f, .48f);
                default: return new Color(.29f, .45f, .72f);
            }
        }

        public static void ApplyUniform(GameObject model, EnemyRole role, int variant)
        {
            var block = new MaterialPropertyBlock();
            foreach (var renderer in model.GetComponentsInChildren<SkinnedMeshRenderer>())
            {
                renderer.GetPropertyBlock(block);
                block.SetColor("_UniformColor", Uniform(role, variant));
                renderer.SetPropertyBlock(block);
            }
        }
    }
}
