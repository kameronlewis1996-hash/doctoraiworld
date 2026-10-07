import React, { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, SafeAreaView, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';

type BriefState = {
  reduceMotion?: boolean;
  timeline: Array<{ type: string; date: string; title: string; description: string }>;
  medications: Array<{ name: string; dose: string; frequency: string; instructions: string }>;
  measurements: Array<{ type: string; value: string; date: string }>;
  appointments: Array<{ date: string }>;
};
const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const validDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00`);
  return !Number.isNaN(parsed.getTime()) && localDate(parsed) === value;
};

export default function VisitBrief({ state, scale = 1 }: { state: BriefState; scale?: number }) {
  const [open, setOpen] = useState(false);
  const [since, setSince] = useState('');
  const [focus, setFocus] = useState('');
  const [questions, setQuestions] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [review, setReview] = useState('');
  const [snapshot, setSnapshot] = useState<BriefState | null>(null);
  const briefState = snapshot || state;
  const today = localDate(new Date());
  const records = useMemo(() => {
    const recent = <T extends { date: string }>(items: T[]) => items.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 100);
    return [
      ...recent(briefState.timeline.filter(item => item.type === 'symptom' || item.type === 'medication')).map((item, i) => ({ id: `note-${i}`, date: item.date, text: [item.date, item.title, item.description].filter(Boolean).join(' · '), category: 'Recorded notes' })),
      ...recent(briefState.measurements).map((item, i) => ({ id: `measurement-${i}`, date: item.date, text: [item.date, item.type, item.value].filter(Boolean).join(' · '), category: 'Measurements' })),
      ...briefState.medications.map((item, i) => ({ id: `medicine-${i}`, date: null, text: [item.name, item.dose, item.frequency, item.instructions].filter(Boolean).join(' · '), category: 'Current saved medicines — not date filtered' })),
    ];
  }, [briefState]);
  const dateError = !!since && (!validDate(since) || since > today);
  const available = records.filter(item => item.date === null || (!dateError && (!since || (validDate(item.date) && item.date >= since)) && (!validDate(item.date) || item.date <= today)));
  const textStyle = { fontSize: 16 * scale, lineHeight: 24 * scale, color: '#14344e' };
  const start = () => {
    setSnapshot({ ...state, timeline: state.timeline.map(item => ({ ...item })), measurements: state.measurements.map(item => ({ ...item })), medications: state.medications.map(item => ({ ...item })) });
    const previous = state.appointments.map(item => item.date).filter(date => validDate(date) && date < today).sort().at(-1);
    const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 30);
    setSince(previous || localDate(monthAgo)); setFocus(''); setQuestions(''); setSelected([]); setReview(''); setOpen(true);
  };
  const close = () => { setOpen(false); setSnapshot(null); setFocus(''); setQuestions(''); setSelected([]); setReview(''); };
  const build = () => {
    if (dateError) return;
    const chosen = available.filter(item => selected.includes(item.id));
    if (!chosen.length && !focus.trim() && !questions.trim()) { Alert.alert('Add something to your brief', 'Choose a record or write your main concern or a question.'); return; }
    setReview([
      'My visit brief', `Prepared ${today}`, since ? `Notes from ${since} through ${today}, inclusive.` : 'All available notes through today.',
      focus.trim() ? `What matters most to me\n${focus.trim()}` : '',
      ...['Recorded notes', 'Measurements', 'Current saved medicines — not date filtered'].map(category => {
        const entries = chosen.filter(item => item.category === category);
        return entries.length ? `${category}\n${entries.map(item => `• ${item.text}`).join('\n')}` : '';
      }),
      questions.trim() ? `Questions to ask\n${questions.trim()}` : '',
      'Selected, self-reported records only. These observations are not a verified history of changes. Check details with your clinician. DoctorAI does not diagnose, prescribe or recommend treatment changes.',
    ].filter(Boolean).join('\n\n'));
  };
  const share = async () => {
    try { await Share.share({ title: 'My visit brief', message: review }); }
    catch { Alert.alert('Could not open sharing', 'Your brief is still here. Try again when you are ready.'); }
  };
  return <>
    <View style={styles.card}>
      <Text style={[textStyle, styles.kicker]}>SINCE MY LAST VISIT</Text>
      <Text style={[textStyle, styles.title]}>Walk in with your story ready</Text>
      <Text style={textStyle}>Bring your recent notes, main concern and questions together in one brief.</Text>
      <Pressable accessibilityRole="button" onPress={start} style={styles.button}><Text style={styles.buttonText}>Build my visit brief →</Text></Pressable>
    </View>
    <Modal visible={open} animationType={state.reduceMotion ? 'none' : 'slide'} onRequestClose={close}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}><Text accessibilityRole="header" style={[textStyle, styles.title]}>{review ? 'Review your brief' : 'Since my last visit'}</Text><Pressable accessibilityRole="button" onPress={close} style={styles.close}><Text style={textStyle}>Close</Text></Pressable></View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {review ? <>
            <Text style={textStyle}>Check the selected details before choosing where to share them.</Text>
            <Text selectable style={[textStyle, styles.review]}>{review}</Text>
            <Pressable accessibilityRole="button" onPress={share} style={styles.button}><Text style={styles.buttonText}>Share reviewed brief</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => setReview('')} style={styles.close}><Text style={textStyle}>Back to edit</Text></Pressable>
          </> : <>
            <Text style={textStyle}>Choose the records you want to include. Nothing is selected automatically or sent to AI.</Text>
            <Text style={[textStyle, styles.label]}>Show notes from</Text>
            <TextInput accessibilityLabel="Show notes from, YYYY-MM-DD" value={since} onChangeText={value => { setSince(value); setSelected([]); }} placeholder="YYYY-MM-DD, or leave blank for all" maxLength={10} autoCorrect={false} style={[textStyle, styles.input]} />
            <Text style={textStyle}>Check this date if your last appointment did not take place. Clear it to include records with missing or older date formats. Current saved medicines are not date filtered.</Text>
            {dateError && <Text accessibilityRole="alert" style={[textStyle, styles.error]}>Enter a valid date no later than today.</Text>}
            <Text style={[textStyle, styles.label]}>What matters most at this visit?</Text>
            <TextInput accessibilityLabel="What matters most at this visit" value={focus} onChangeText={setFocus} multiline maxLength={500} placeholder="The one thing I most want to discuss…" style={[textStyle, styles.input]} />
            <Text style={[textStyle, styles.label]}>Choose records ({available.length})</Text>
            {!available.length && <Text style={textStyle}>No saved records in this period. You can still prepare your main concern and questions.</Text>}
            {available.map(item => <Pressable key={item.id} accessibilityRole="checkbox" accessibilityState={{ checked: selected.includes(item.id) }} accessibilityLabel={`${item.category}: ${item.text}`} onPress={() => setSelected(current => current.includes(item.id) ? current.filter(id => id !== item.id) : [...current, item.id])} style={styles.choice}>
              <Text style={textStyle}>{selected.includes(item.id) ? '☑' : '☐'} {item.text}</Text><Text style={styles.muted}>{item.category}</Text>
            </Pressable>)}
            <Text style={styles.muted}>Up to 100 recent notes and 100 measurements are available, plus current saved medicines.</Text>
            <Text style={[textStyle, styles.label]}>Questions to ask</Text>
            <TextInput accessibilityLabel="Questions to ask" value={questions} onChangeText={setQuestions} multiline maxLength={2000} placeholder="What would I like explained?" style={[textStyle, styles.input]} />
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: dateError }} disabled={dateError} onPress={build} style={[styles.button, dateError && { opacity: 0.5 }]}><Text style={styles.buttonText}>Review my brief →</Text></Pressable>
          </>}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  </>;
}
const styles = StyleSheet.create({
  card: { padding: 22, marginVertical: 12, borderRadius: 22, backgroundColor: '#eaf7ff', borderWidth: 1, borderColor: '#c7e4f4', gap: 12 },
  kicker: { fontSize: 12, fontWeight: '700', color: '#0759b6' },
  title: { fontSize: 23, lineHeight: 29, fontWeight: '700', flexShrink: 1 },
  button: { minHeight: 48, padding: 14, borderRadius: 14, backgroundColor: '#0759b6', alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  screen: { flex: 1, backgroundColor: '#f7fbff' },
  header: { padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  close: { minHeight: 48, padding: 12, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 20, gap: 12, paddingBottom: 36 },
  label: { marginTop: 12, fontWeight: '700' },
  input: { minHeight: 52, padding: 14, borderWidth: 1, borderColor: '#b9cfdf', borderRadius: 12, backgroundColor: '#fff', textAlignVertical: 'top' },
  choice: { padding: 14, borderWidth: 1, borderColor: '#d4e4ee', borderRadius: 12, backgroundColor: '#fff', gap: 8 },
  muted: { fontSize: 13, lineHeight: 20, color: '#526b7e' },
  error: { color: '#99372b' },
  review: { padding: 18, backgroundColor: '#fff', borderRadius: 14 },
});
