import { type ReactNode } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

/** Pages either side of the open one that stay mounted, so a quick run of turns never shows a blank page. */
const WINDOW_BEHIND = 2;
const WINDOW_AHEAD = 3;

type Props = {
  pages: ReactNode[];
  width: number;
  height: number;
  index: number;
  onIndexChange: (index: number) => void;
  /** The paper the back of a turned page shows. */
  backColor: string;
  edgeColor: string;
};

/**
 * A book whose pages fold over toward the spine on the left, following the finger. Dragging left lifts the open page
 * and turns it over; dragging right brings the last turned page back. A page lifted a quarter of the way, or
 * flicked, finishes its turn; otherwise it falls back.
 */
export function FlipBook({ pages, width, height, index, onIndexChange, backColor, edgeColor }: Props) {
  const current = useSharedValue(index);
  const active = useSharedValue(-1);
  const angle = useSharedValue(0);
  /** The page a released sheet is settling onto, or -1 when nothing is moving. */
  const settling = useSharedValue(-1);
  const count = pages.length;
  // `index` only seeds the book: the open page lives in `current` from then on. Syncing it back from `index` re-applied
  // stale pages during a run of quick turns (React lags the UI thread), so turned pages came round a second time.

  // A real swipe drifts up or down a little; only a mostly vertical drag is left alone.
  const pan = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .failOffsetY([-40, 40])
    .onStart(() => {
      // A swipe that lands while the last page is still settling takes it straight to where it was going. Picking the
      // moving sheet back up laid it flat again from the start of the new drag, so it showed a second time.
      const next = settling.get();
      if (next < 0) return;
      cancelAnimation(angle);
      const open = current.get();
      settling.set(-1);
      current.set(next);
      active.set(-1);
      if (next !== open) scheduleOnRN(onIndexChange, next);
    })
    .onUpdate((event) => {
      const open = current.get();
      if (active.get() < 0) {
        if (event.translationX < 0 && open < count - 1) active.set(open);
        else if (event.translationX > 0 && open > 0) active.set(open - 1);
        else return;
      }
      const forward = active.get() === open;
      const travel = forward ? -event.translationX : width - event.translationX;
      angle.set(Math.min(180, Math.max(0, (travel / width) * 180)));
    })
    .onEnd((event) => {
      const turning = active.get();
      if (turning < 0) return;
      const open = current.get();
      const forward = turning === open;
      const done = forward ? angle.get() > 45 || event.velocityX < -300 : angle.get() < 135 || event.velocityX > 300;
      const target = forward === done ? 180 : 0;
      const next = done ? (forward ? open + 1 : open - 1) : open;
      settling.set(next);
      angle.set(withTiming(target, { duration: 420, easing: Easing.out(Easing.cubic) }, (finished) => {
        if (!finished) return;
        settling.set(-1);
        current.set(next);
        active.set(-1);
        if (next !== open) scheduleOnRN(onIndexChange, next);
      }));
    });

  const first = Math.max(0, index - WINDOW_BEHIND);
  const last = Math.min(count - 1, index + WINDOW_AHEAD);
  const mounted: number[] = [];
  // Later pages first, so each page sits on top of the ones after it.
  for (let page = last; page >= first; page--) mounted.push(page);

  return <GestureDetector gesture={pan}>
    <View style={{ width, height }} collapsable={false}>
      {/* The edges of the pages still to come, peeking out under the open one. */}
      {index < count - 1 && <>
        <View style={[styles.edge, { width, height, top: 4, left: 3, backgroundColor: edgeColor }]} />
        <View style={[styles.edge, { width, height, top: 2, left: 1.5, backgroundColor: edgeColor }]} />
      </>}
      {mounted.map((page) => <Page key={page} page={page} width={width} height={height} current={current} active={active}
        angle={angle} backColor={backColor}>{pages[page]}</Page>)}
    </View>
  </GestureDetector>;
}

/**
 * One sheet. While it turns it is folded along a vertical crease that sweeps from the right edge to the spine:
 * right of the crease the next page shows, the folded-over flap (the back of the sheet) lies left of it with a
 * curl highlight, and the crease casts a shadow on the page underneath. Turned sheets rest folded fully over,
 * left of the spine.
 */
function Page({ page, width, height, current, active, angle, backColor, children }: {
  page: number; width: number; height: number; current: SharedValue<number>; active: SharedValue<number>;
  angle: SharedValue<number>; backColor: string; children: ReactNode;
}) {
  // Each style reads the shared values itself: a mapper only re-runs for values it reads directly, so going through
  // a helper left the sheet frozen until the turn was over.
  // What is left of the face: everything left of the crease.
  const face = useAnimatedStyle(() => {
    const done = (active.get() === page ? angle.get() : page < current.get() ? 180 : 0) / 180;
    return { width: width * (1 - done) };
  });
  // The flap is as wide as the part already folded, mirrored to the left of the crease. Only a sheet in mid-turn
  // shows it: turned sheets resting left of the spine stuck out past the book as a strip of paper.
  const flap = useAnimatedStyle(() => {
    const done = (active.get() === page ? angle.get() : page < current.get() ? 180 : 0) / 180;
    return { left: width * (1 - 2 * done), width: width * done, opacity: done > 0 && done < 1 ? 1 : 0 };
  });
  const crease = useAnimatedStyle(() => {
    const done = (active.get() === page ? angle.get() : page < current.get() ? 180 : 0) / 180;
    return { left: width * (1 - done), opacity: done > 0 && done < 1 ? Math.min(1, Math.sin(done * Math.PI) * 1.6) : 0 };
  });
  return <View pointerEvents="box-none" style={[styles.page, { width, height }]}>
    <Animated.View style={[styles.face, face]}>
      <View style={{ width, height }}>{children}</View>
    </Animated.View>
    <Animated.View pointerEvents="none" style={[styles.flap, { height, backgroundColor: backColor }, flap]}>
      {/* Lit where the paper rolls over, darker toward the crease. */}
      <LinearGradient colors={["rgba(255,255,255,0.35)", "rgba(255,255,255,0)", "rgba(0,0,0,0.18)"]} locations={[0, 0.45, 1]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
    </Animated.View>
    <Animated.View pointerEvents="none" style={[styles.crease, { height }, crease]}>
      <LinearGradient colors={["rgba(0,0,0,0.28)", "rgba(0,0,0,0)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  page: { position: "absolute", top: 0, left: 0 },
  face: { position: "absolute", top: 0, left: 0, bottom: 0, overflow: "hidden", borderTopLeftRadius: 4, borderBottomLeftRadius: 4, borderTopRightRadius: 16, borderBottomRightRadius: 16 },
  flap: { position: "absolute", top: 0, overflow: "hidden", borderTopLeftRadius: 16, borderBottomLeftRadius: 16, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  crease: { position: "absolute", top: 0, width: 28 },
  edge: { position: "absolute", borderTopLeftRadius: 4, borderBottomLeftRadius: 4, borderTopRightRadius: 16, borderBottomRightRadius: 16 },
});
