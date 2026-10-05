using UnityEditor;
using UnityEngine;
namespace SniperRidge.EditorTools
{
    public static class TankRampageMotionImport
    {
        public static void Run()
        {
            var set=Resources.Load<NativeMutantSet>(HulkVisual.Resource);
            set.TankClimb=StreetMotionImport.Import("Braced Hang Hop Up");
            set.TankPull=StreetMotionImport.Import("Sumo High Pull");
            set.TankThrow=StreetMotionImport.Import("Goalie Throw");
            set.TankRestrain=StreetMotionImport.Import("Restrain");
            set.ShellHit=StreetMotionImport.Import("Receiving An Uppercut");
            EnemyMeleeDeathImport.Retarget("Assets/MutantCharacter/Source/Mutant Jumping.fbx","Assets/Resources/Enemies/TankEscape.anim","TankEscape");
            EditorUtility.SetDirty(set);AssetDatabase.SaveAssets();Debug.Log("[Tank rampage] Five native Mixamo motions and human escape imported.");
        }
    }
}
